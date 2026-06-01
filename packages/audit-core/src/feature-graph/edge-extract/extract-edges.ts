// Content-based edge extraction — the heart of the accurate feature graph.
//
// For each page/component/action SOURCE file we read its contents from disk and
// scan three signal classes (all regex/string scanning — NO TS AST, mirroring
// the existing route-ast extractors):
//
//   1. `import`/`require` statements  → resolve via resolve-import:
//        - import target is a component node → `contains` / `renders`
//        - import target is an action node   → `triggers`
//   2. `fetch('/api/..')` / axios calls       → `calls_api` to the api node whose
//        urlPath matches; when no api node matches, create a REAL `missing` node
//        + a `missing_link` edge TO it (so the canvas renders it — it drops
//        edges whose target node is absent).
//   3. ORM/DB model usage in api/action files → `reads_from` / `writes_to`
//        keyed off `dataModelInventory.entities[].name`
//        (`prisma.<model>.`, `db.<model>.`, `model('X')`, `collection('x')`).
//
// CRITICAL invariant: an edge is ONLY emitted when its target node id exists in
// `nodes` (or in the `missing` nodes this module itself creates). Unresolved
// imports / un-matched fetches produce NO fabricated edge — honesty over recall.
//
// Pure-with-IO: reads files but never mutates its inputs. Returns a Map keyed by
// source node id, augmented with the `missing` nodes it created so the caller
// can append them to the graph.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type {
  DataModelInventory,
  FeatureEdgeType,
  RouteInventory,
} from '@cleartoship/shared-types';
import type { GraphNode } from './build-nodes.js';
import { isExcludedFile } from './exclude-file.js';
import { loadPathAliases } from './load-path-aliases.js';
import { resolveImport } from './resolve-import.js';

export interface ExtractedEdge {
  readonly target: string;
  readonly type: FeatureEdgeType;
  readonly summary?: string | null;
}

export interface ExtractEdgesInput {
  readonly clonePath: string;
  readonly fileTree: ReadonlyArray<string>;
  readonly routeInventory: RouteInventory;
  readonly dataModelInventory: DataModelInventory;
  readonly nodes: ReadonlyArray<GraphNode>;
  readonly sourceByNodeId: Readonly<Record<string, string>>;
}

/** Map keyed by source node id, augmented with the `missing` nodes created. */
export interface EdgeMap extends Map<string, ReadonlyArray<ExtractedEdge>> {
  /** `missing` nodes the extractor created for unresolved fetch targets. */
  extraNodes: ReadonlyArray<GraphNode>;
  /** Count of source files that failed to read (previously swallowed silently). */
  readFailures: number;
  /** Up to 50 `rel (CODE)` samples of read failures, for log surfacing. */
  readFailureSamples: ReadonlyArray<string>;
}

// `import x from '...'` / `import '...'` / `export ... from '...'`.
const IMPORT_RE = /\b(?:import|export)\b[^'"`;]*?from\s*['"`]([^'"`]+)['"`]|\bimport\s*['"`]([^'"`]+)['"`]|\brequire\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
// `fetch('/api/...')` or axios.get('/api/...') / axios('/api/...').
const FETCH_RE = /\b(?:fetch|axios(?:\.\w+)?)\s*\(\s*[`'"]([^`'"]+)[`'"]/g;

// Bounded parallelism for the per-node source-file reads (was fully sequential).
const READ_CONCURRENCY = 8;

/** Escape a string for safe LITERAL use inside a `new RegExp(...)` source. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mutable accumulator for file-read observability (failures were silent). */
interface ReadStats {
  failures: number;
  samples: string[];
}

/**
 * Run `fn` over `items` with at most `limit` concurrent executions, preserving
 * result order. The index allocation (`const i = next; next += 1;`) has no
 * `await` between read and increment, so it is atomic on JS's single thread.
 */
async function mapWithConcurrency<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  }
  const pool = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(pool);
  return results;
}

function nodeTypeById(nodes: ReadonlyArray<GraphNode>): Map<string, GraphNode['type']> {
  const m = new Map<string, GraphNode['type']>();
  for (const n of nodes) m.set(n.id, n.type);
  return m;
}

/** All known repo-relative file paths, as a set, for resolveImport. */
function buildFileSet(fileTree: ReadonlyArray<string>): Set<string> {
  return new Set(fileTree.map((p) => p.replace(/\\/g, '/')));
}

/** Split a URL/route path into non-empty segments (drops query + trailing /). */
function pathSegments(p: string): string[] {
  const noQuery = p.split('?')[0] ?? p;
  return noQuery.split('/').filter((s) => s.length > 0);
}

/** Classify a route slot segment by its bracket syntax. */
type SlotKind = 'static' | 'dynamic' | 'catchAll';
function slotKind(seg: string): SlotKind {
  // `[[...x]]` (optional catch-all) and `[...x]` (catch-all) both match a tail.
  if (/^\[\[?\.\.\..+\]\]?$/.test(seg)) return 'catchAll';
  if (/^\[.+\]$/.test(seg)) return 'dynamic';
  return 'static';
}

/**
 * Does a CONCRETE fetched URL match a (possibly parameterised) route urlPath?
 * Compares segment-by-segment:
 *   - a static slot must equal the concrete segment,
 *   - a dynamic slot `[id]` matches exactly one concrete segment,
 *   - a catch-all slot `[...slug]` matches the remaining tail (>=1 segment;
 *     optional catch-all also matches zero, handled by the length check).
 * This fixes the prior exact/startsWith check that failed for
 * `fetch('/api/posts/123')` vs inventoried `/api/posts/[id]`.
 */
function urlMatchesRoute(concreteUrl: string, routeUrl: string): boolean {
  const got = pathSegments(concreteUrl);
  const slots = pathSegments(routeUrl);

  let gi = 0;
  for (let si = 0; si < slots.length; si += 1) {
    const slot = slots[si] ?? '';
    const kind = slotKind(slot);
    if (kind === 'catchAll') {
      // Catch-all consumes the entire remaining tail. Optional catch-all also
      // matches when nothing remains. There can be no further slots after it.
      const isOptional = /^\[\[/.test(slot);
      const remaining = got.length - gi;
      return isOptional ? si === slots.length - 1 : remaining >= 1 && si === slots.length - 1;
    }
    if (gi >= got.length) return false; // route has more required slots than URL.
    if (kind === 'static') {
      if (slot !== got[gi]) return false;
    }
    // dynamic: matches any single concrete segment — just advance.
    gi += 1;
  }
  // All slots consumed; URL must have no leftover segments.
  return gi === got.length;
}

/** node id of the api whose urlPath matches the concrete fetched `urlPath`. */
function apiNodeForUrl(
  urlPath: string,
  routeInventory: RouteInventory,
  nodeIds: ReadonlySet<string>,
): string | null {
  for (const route of routeInventory.routes) {
    if (route.type !== 'api') continue;
    if (!urlMatchesRoute(urlPath, route.urlPath)) continue;
    const cleaned = route.urlPath.replace(/^\//, '').replace(/\//g, '.') || 'root';
    const id = `api.${cleaned}`;
    if (nodeIds.has(id)) return id;
  }
  return null;
}

async function readFileSafe(
  clonePath: string,
  rel: string,
  stats: ReadStats,
): Promise<string | null> {
  try {
    return await fsp.readFile(path.join(clonePath, rel), 'utf8');
  } catch (err) {
    stats.failures += 1;
    if (stats.samples.length < 50) {
      const code = (err as NodeJS.ErrnoException)?.code ?? 'ERR';
      stats.samples.push(`${rel} (${code})`);
    }
    return null;
  }
}

function uniqueEdges(edges: ReadonlyArray<ExtractedEdge>): ExtractedEdge[] {
  const seen = new Set<string>();
  const out: ExtractedEdge[] = [];
  for (const e of edges) {
    const k = `${e.type}:${e.target}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/** Scan import statements → contains/renders (component) + triggers (action). */
function scanImports(
  content: string,
  importerPath: string,
  aliases: Parameters<typeof resolveImport>[2],
  fileSet: ReadonlySet<string>,
  sourceToNodeId: ReadonlyMap<string, string>,
  typeById: ReadonlyMap<string, GraphNode['type']>,
): ExtractedEdge[] {
  const edges: ExtractedEdge[] = [];
  for (const m of content.matchAll(IMPORT_RE)) {
    const specifier = m[1] ?? m[2] ?? m[3];
    if (!specifier) continue;
    const resolved = resolveImport(importerPath, specifier, aliases, fileSet);
    if (!resolved || isExcludedFile(resolved)) continue;
    const targetId = sourceToNodeId.get(resolved);
    if (!targetId) continue;
    const targetType = typeById.get(targetId);
    if (targetType === 'component') {
      edges.push({ target: targetId, type: 'contains' });
    } else if (targetType === 'action') {
      edges.push({ target: targetId, type: 'triggers' });
    }
  }
  return edges;
}

/** Scan fetch/axios calls → calls_api (matched) OR missing node + missing_link. */
function scanFetches(
  content: string,
  sourceLabel: string,
  routeInventory: RouteInventory,
  nodeIds: ReadonlySet<string>,
  missingRegistry: Map<string, GraphNode>,
): ExtractedEdge[] {
  const edges: ExtractedEdge[] = [];
  for (const m of content.matchAll(FETCH_RE)) {
    const url = m[1];
    if (!url || !url.includes('/api/')) continue;
    // Trim everything up to and including the first `/api/` for normalisation.
    const apiIdx = url.indexOf('/api/');
    const apiUrl = url.slice(apiIdx);
    const apiId = apiNodeForUrl(apiUrl, routeInventory, nodeIds);
    if (apiId) {
      edges.push({ target: apiId, type: 'calls_api' });
    } else {
      const cleaned = apiUrl.split('?')[0]?.replace(/\/$/, '') ?? apiUrl;
      const missingId = `missing.api.${cleaned.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '.')}`;
      if (!missingRegistry.has(missingId)) {
        missingRegistry.set(missingId, {
          id: missingId,
          type: 'api',
          label: `${cleaned} (미구현 추정)`,
          status: 'missing',
          confidence: 'LOW',
          summary: `${sourceLabel}이(가) ${cleaned}를 호출하지만 해당 API 라우트를 찾지 못했습니다.`,
        });
      }
      edges.push({ target: missingId, type: 'missing_link' });
    }
  }
  return edges;
}

/** Scan ORM/DB usage → reads_from / writes_to for matching data_model nodes. */
function scanOrmUsage(
  content: string,
  entityNames: ReadonlyArray<string>,
  nodeIds: ReadonlySet<string>,
): ExtractedEdge[] {
  const edges: ExtractedEdge[] = [];
  const writeMethods = /\b(create|createMany|update|updateMany|upsert|delete|deleteMany|set|add|insert|save)\b/;
  const readMethods = /\b(find\w*|get|aggregate|count|query|where|select)\b/;
  for (const name of entityNames) {
    const modelId = `data_model.${name}`;
    if (!nodeIds.has(modelId)) continue;
    const lc = name.charAt(0).toLowerCase() + name.slice(1);
    // Escape entity names — they flow from inventory data and may contain regex
    // metacharacters that would otherwise corrupt (or crash) the patterns.
    const safeName = escapeRegExp(name);
    const safeLc = escapeRegExp(lc);
    // prisma.<model>. / db.<model>. (case-insensitive first char).
    const accessorRe = new RegExp(
      `(?:prisma|db|orm)\\.(?:${safeName}|${safeLc})\\.(\\w+)`,
      'g',
    );
    // mongoose-style: model('Post') / collection('posts').
    const factoryRe = new RegExp(
      `(?:model|collection)\\(\\s*[\`'"]${safeName}s?[\`'"]`,
      'gi',
    );
    let reads = false;
    let writes = false;
    for (const m of content.matchAll(accessorRe)) {
      const method = m[1] ?? '';
      if (writeMethods.test(method)) writes = true;
      else if (readMethods.test(method)) reads = true;
      else reads = true; // unknown accessor → conservative read.
    }
    if (factoryRe.test(content)) reads = true;
    if (reads) edges.push({ target: modelId, type: 'reads_from' });
    if (writes) edges.push({ target: modelId, type: 'writes_to' });
  }
  return edges;
}

export async function extractEdges(input: ExtractEdgesInput): Promise<EdgeMap> {
  const map = new Map<string, ReadonlyArray<ExtractedEdge>>() as EdgeMap;
  const missingRegistry = new Map<string, GraphNode>();

  if (!input.clonePath) {
    map.extraNodes = [];
    map.readFailures = 0;
    map.readFailureSamples = [];
    return map;
  }

  const aliases = await loadPathAliases(input.clonePath);
  const fileSet = buildFileSet(input.fileTree);
  const typeById = nodeTypeById(input.nodes);
  const nodeIds = new Set(input.nodes.map((n) => n.id));
  const entityNames = input.dataModelInventory.entities.map((e) => e.name);

  // Reverse lookup: source file → node id (only for nodes that have a source).
  const sourceToNodeId = new Map<string, string>();
  for (const [nodeId, src] of Object.entries(input.sourceByNodeId)) {
    sourceToNodeId.set(src.replace(/\\/g, '/'), nodeId);
  }

  // Only page/component/action nodes are edge SOURCES (they "contain"/"call").
  // API nodes are sources too — for reads_from/writes_to to data models.
  const candidates = input.nodes
    .map((node) => ({ node, src: input.sourceByNodeId[node.id] }))
    .filter((c): c is { node: GraphNode; src: string } =>
      Boolean(c.src) && !isExcludedFile(c.src as string),
    );

  // Phase 1: read all candidate source files with bounded concurrency (8-way).
  const readStats: ReadStats = { failures: 0, samples: [] };
  const contents = await mapWithConcurrency(candidates, READ_CONCURRENCY, (c) =>
    readFileSafe(input.clonePath, c.src, readStats),
  );

  // Phase 2: scan IN ORDER so the `missing` node creation order stays
  // deterministic (it mirrors the original sequential node iteration).
  for (let i = 0; i < candidates.length; i += 1) {
    const { node, src } = candidates[i] as { node: GraphNode; src: string };
    const content = contents[i];
    if (content === null || content === undefined) continue;

    const edges: ExtractedEdge[] = [];

    if (node.type === 'page' || node.type === 'component' || node.type === 'action') {
      edges.push(
        ...scanImports(content, src, aliases, fileSet, sourceToNodeId, typeById),
      );
      edges.push(...scanFetches(content, node.label, input.routeInventory, nodeIds, missingRegistry));
    }

    if (node.type === 'api' || node.type === 'action') {
      edges.push(...scanOrmUsage(content, entityNames, nodeIds));
    }

    if (edges.length > 0) {
      map.set(node.id, uniqueEdges(edges));
    }
  }

  map.extraNodes = Array.from(missingRegistry.values());
  map.readFailures = readStats.failures;
  map.readFailureSamples = readStats.samples;
  return map;
}
