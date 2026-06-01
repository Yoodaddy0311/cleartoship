import { describe, it, expect, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  DataModelInventory,
  RouteInventory,
} from '@cleartoship/shared-types';
import { buildNodes } from './build-nodes.js';
import { extractEdges } from './extract-edges.js';

interface FixtureFile {
  readonly path: string;
  readonly content: string;
}

async function writeFixture(files: ReadonlyArray<FixtureFile>): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'edge-extract-'));
  for (const f of files) {
    const abs = path.join(dir, f.path);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, f.content, 'utf8');
  }
  return dir;
}

function inv(routes: RouteInventory['routes']): RouteInventory {
  return {
    routes,
    counts: {
      pages: routes.filter((r) => r.type === 'page').length,
      apis: routes.filter((r) => r.type === 'api').length,
      dynamic: 0,
      byFramework: {} as RouteInventory['counts']['byFramework'],
    },
    hasNextJs: routes.length > 0,
    isEmpty: routes.length === 0,
  };
}

const PAGE = (urlPath: string, sourceFile: string): RouteInventory['routes'][number] => ({
  urlPath,
  framework: 'next-app',
  type: 'page',
  sourceFile,
  segments: [],
  hasDynamic: false,
  hasCatchAll: false,
});

const API = (urlPath: string, sourceFile: string): RouteInventory['routes'][number] => ({
  urlPath,
  framework: 'next-app-api',
  type: 'api',
  sourceFile,
  segments: [],
  hasDynamic: false,
  hasCatchAll: false,
});

const NONE_DM: DataModelInventory = {
  tech: 'none',
  entities: [],
  sourceFiles: [],
  confidence: 'high',
};

/** Flatten the Map<nodeId, edges[]> into a single edge list for assertions. */
function flatten(map: Map<string, ReadonlyArray<{ target: string; type: string }>>) {
  const out: Array<{ source: string; target: string; type: string }> = [];
  for (const [source, edges] of map) {
    for (const e of edges) out.push({ source, target: e.target, type: e.type });
  }
  return out;
}

describe('extractEdges — import-based contains/renders', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await fsp.rm(dir, { recursive: true, force: true });
  });

  it('emits a contains edge when a page imports a top-level component (taxonomy alias)', async () => {
    dir = await writeFixture([
      { path: 'tsconfig.json', content: JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'] } } }) },
      { path: 'app/page.tsx', content: `import { Button } from '@/components/ui/button';\nexport default function P() { return <Button/>; }` },
      { path: 'components/ui/button.tsx', content: `export function Button() { return null; }` },
    ]);
    const fileTree = ['app/page.tsx', 'components/ui/button.tsx', 'tsconfig.json'];
    const routeInventory = inv([PAGE('/', 'app/page.tsx')]);
    const { nodes, sourceByNodeId } = buildNodes({ fileTree, routeInventory, dataModelInventory: NONE_DM });
    const map = await extractEdges({
      clonePath: dir,
      fileTree,
      routeInventory,
      dataModelInventory: NONE_DM,
      nodes,
      sourceByNodeId,
    });
    const edges = flatten(map);
    const pageId = nodes.find((n) => n.type === 'page')!.id;
    const compId = nodes.find((n) => n.type === 'component')!.id;
    expect(edges).toContainEqual({ source: pageId, target: compId, type: 'contains' });
  });

  it('NEVER emits an edge to a non-existent node id (phantom-target bug fix)', async () => {
    dir = await writeFixture([
      { path: 'app/page.tsx', content: `import { Ghost } from './ghost';` },
    ]);
    const fileTree = ['app/page.tsx'];
    const routeInventory = inv([PAGE('/', 'app/page.tsx')]);
    const { nodes, sourceByNodeId } = buildNodes({ fileTree, routeInventory, dataModelInventory: NONE_DM });
    const map = await extractEdges({
      clonePath: dir,
      fileTree,
      routeInventory,
      dataModelInventory: NONE_DM,
      nodes,
      sourceByNodeId,
    });
    const nodeIds = new Set(nodes.map((n) => n.id));
    for (const e of flatten(map)) {
      expect(nodeIds.has(e.target)).toBe(true);
    }
  });
});

describe('extractEdges — calls_api via fetch / axios', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await fsp.rm(dir, { recursive: true, force: true });
  });

  it('emits calls_api to the matching API node from a fetch literal', async () => {
    dir = await writeFixture([
      { path: 'app/dashboard/page.tsx', content: `export default async function P() { const r = await fetch('/api/posts'); return null; }` },
      { path: 'app/api/posts/route.ts', content: `export async function GET() {}` },
    ]);
    const fileTree = ['app/dashboard/page.tsx', 'app/api/posts/route.ts'];
    const routeInventory = inv([
      PAGE('/dashboard', 'app/dashboard/page.tsx'),
      API('/api/posts', 'app/api/posts/route.ts'),
    ]);
    const { nodes, sourceByNodeId } = buildNodes({ fileTree, routeInventory, dataModelInventory: NONE_DM });
    const map = await extractEdges({
      clonePath: dir,
      fileTree,
      routeInventory,
      dataModelInventory: NONE_DM,
      nodes,
      sourceByNodeId,
    });
    const edges = flatten(map);
    const pageId = nodes.find((n) => n.type === 'page')!.id;
    const apiId = nodes.find((n) => n.type === 'api')!.id;
    expect(edges).toContainEqual({ source: pageId, target: apiId, type: 'calls_api' });
  });

  it('matches a concrete URL against a DYNAMIC route slot (fetch(/api/posts/123) → /api/posts/[id])', async () => {
    dir = await writeFixture([
      {
        path: 'app/post/page.tsx',
        content: `export default async function P() { const r = await fetch('/api/posts/123'); return null; }`,
      },
      { path: 'app/api/posts/[id]/route.ts', content: `export async function GET() {}` },
    ]);
    const fileTree = ['app/post/page.tsx', 'app/api/posts/[id]/route.ts'];
    const dynApi = {
      ...API('/api/posts/[id]', 'app/api/posts/[id]/route.ts'),
      hasDynamic: true,
      segments: [
        { name: 'api', kind: 'static' as const },
        { name: 'posts', kind: 'static' as const },
        { name: 'id', kind: 'dynamic' as const },
      ],
    };
    const routeInventory = inv([PAGE('/post', 'app/post/page.tsx'), dynApi]);
    const { nodes, sourceByNodeId } = buildNodes({ fileTree, routeInventory, dataModelInventory: NONE_DM });
    const map = await extractEdges({
      clonePath: dir,
      fileTree,
      routeInventory,
      dataModelInventory: NONE_DM,
      nodes,
      sourceByNodeId,
    });
    const edges = flatten(map);
    const pageId = nodes.find((n) => n.type === 'page')!.id;
    const apiId = nodes.find((n) => n.type === 'api')!.id;
    // It resolves to the dynamic API node as a real calls_api edge...
    expect(edges).toContainEqual({ source: pageId, target: apiId, type: 'calls_api' });
    // ...and does NOT fabricate a spurious missing node / missing_link.
    expect(edges.some((e) => e.type === 'missing_link')).toBe(false);
    expect(map.extraNodes.length).toBe(0);
  });

  it('matches a concrete tail against a CATCH-ALL route slot (fetch(/api/proxy/a/b/c) → /api/proxy/[...path])', async () => {
    dir = await writeFixture([
      {
        path: 'app/proxy/page.tsx',
        content: `export default function P() { fetch('/api/proxy/a/b/c'); return null; }`,
      },
      { path: 'app/api/proxy/[...path]/route.ts', content: `export async function GET() {}` },
    ]);
    const fileTree = ['app/proxy/page.tsx', 'app/api/proxy/[...path]/route.ts'];
    const catchAllApi = {
      ...API('/api/proxy/[...path]', 'app/api/proxy/[...path]/route.ts'),
      hasDynamic: true,
      hasCatchAll: true,
      segments: [
        { name: 'api', kind: 'static' as const },
        { name: 'proxy', kind: 'static' as const },
        { name: 'path', kind: 'catchAll' as const },
      ],
    };
    const routeInventory = inv([PAGE('/proxy', 'app/proxy/page.tsx'), catchAllApi]);
    const { nodes, sourceByNodeId } = buildNodes({ fileTree, routeInventory, dataModelInventory: NONE_DM });
    const map = await extractEdges({
      clonePath: dir,
      fileTree,
      routeInventory,
      dataModelInventory: NONE_DM,
      nodes,
      sourceByNodeId,
    });
    const edges = flatten(map);
    const apiId = nodes.find((n) => n.type === 'api')!.id;
    expect(edges.some((e) => e.target === apiId && e.type === 'calls_api')).toBe(true);
    expect(edges.some((e) => e.type === 'missing_link')).toBe(false);
  });

  it('emits a real missing node + missing_link when a page fetches an undefined API', async () => {
    dir = await writeFixture([
      { path: 'app/form/page.tsx', content: `export default function P() { fetch('/api/ghost'); return null; }` },
    ]);
    const fileTree = ['app/form/page.tsx'];
    const routeInventory = inv([PAGE('/form', 'app/form/page.tsx')]);
    const { nodes, sourceByNodeId } = buildNodes({ fileTree, routeInventory, dataModelInventory: NONE_DM });
    const map = await extractEdges({
      clonePath: dir,
      fileTree,
      routeInventory,
      dataModelInventory: NONE_DM,
      nodes,
      sourceByNodeId,
    });
    const edges = flatten(map);
    const missingLink = edges.find((e) => e.type === 'missing_link');
    expect(missingLink).toBeDefined();
    // The missing_link target MUST be a real node that the build step appended.
    expect(map.extraNodes.some((n) => n.id === missingLink!.target && n.status === 'missing')).toBe(true);
  });
});

describe('extractEdges — reads_from / writes_to via ORM usage', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await fsp.rm(dir, { recursive: true, force: true });
  });

  const dataModel: DataModelInventory = {
    tech: 'prisma',
    entities: [
      { name: 'Post', fieldCount: 4, hasRelations: true, sourceFile: 'prisma/schema.prisma' },
    ],
    sourceFiles: ['prisma/schema.prisma'],
    confidence: 'high',
  };

  it('emits writes_to + reads_from from an API route using prisma.<model>', async () => {
    dir = await writeFixture([
      {
        path: 'app/api/posts/route.ts',
        content: `import { prisma } from '@/lib/db';
export async function GET() { return prisma.post.findMany(); }
export async function POST() { return prisma.post.create({ data: {} }); }`,
      },
      { path: 'prisma/schema.prisma', content: `model Post { id Int @id }` },
    ]);
    const fileTree = ['app/api/posts/route.ts', 'prisma/schema.prisma'];
    const routeInventory = inv([API('/api/posts', 'app/api/posts/route.ts')]);
    const { nodes, sourceByNodeId } = buildNodes({ fileTree, routeInventory, dataModelInventory: dataModel });
    const map = await extractEdges({
      clonePath: dir,
      fileTree,
      routeInventory,
      dataModelInventory: dataModel,
      nodes,
      sourceByNodeId,
    });
    const edges = flatten(map);
    const apiId = nodes.find((n) => n.type === 'api')!.id;
    const modelId = 'data_model.Post';
    expect(edges).toContainEqual({ source: apiId, target: modelId, type: 'reads_from' });
    expect(edges).toContainEqual({ source: apiId, target: modelId, type: 'writes_to' });
  });
});

describe('extractEdges — entity names are regex-escaped', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await fsp.rm(dir, { recursive: true, force: true });
  });

  it('does not throw when an entity name contains regex metacharacters', async () => {
    // Unescaped, `User(` makes `(?:prisma|db|orm)\.(?:User(|user()\.` — an
    // unbalanced paren — so `new RegExp` would throw and extractEdges reject.
    const dm: DataModelInventory = {
      tech: 'prisma',
      entities: [
        { name: 'User(', fieldCount: 1, hasRelations: false, sourceFile: 'prisma/schema.prisma' },
      ],
      sourceFiles: ['prisma/schema.prisma'],
      confidence: 'high',
    };
    dir = await writeFixture([
      { path: 'app/api/x/route.ts', content: `export async function GET() { return 1; }` },
      { path: 'prisma/schema.prisma', content: `model X {}` },
    ]);
    const fileTree = ['app/api/x/route.ts', 'prisma/schema.prisma'];
    const routeInventory = inv([API('/api/x', 'app/api/x/route.ts')]);
    const { nodes, sourceByNodeId } = buildNodes({ fileTree, routeInventory, dataModelInventory: dm });
    await expect(
      extractEdges({ clonePath: dir, fileTree, routeInventory, dataModelInventory: dm, nodes, sourceByNodeId }),
    ).resolves.toBeDefined();
  });

  it('matches entity names LITERALLY (a `.` metachar must not match any char)', async () => {
    // Unescaped, `Us.r` would match `User`; escaped, it must not.
    const dm: DataModelInventory = {
      tech: 'prisma',
      entities: [
        { name: 'Us.r', fieldCount: 1, hasRelations: false, sourceFile: 'prisma/schema.prisma' },
      ],
      sourceFiles: ['prisma/schema.prisma'],
      confidence: 'high',
    };
    dir = await writeFixture([
      { path: 'app/api/u/route.ts', content: `export async function GET() { return prisma.User.findMany(); }` },
      { path: 'prisma/schema.prisma', content: `model X {}` },
    ]);
    const fileTree = ['app/api/u/route.ts', 'prisma/schema.prisma'];
    const routeInventory = inv([API('/api/u', 'app/api/u/route.ts')]);
    const { nodes, sourceByNodeId } = buildNodes({ fileTree, routeInventory, dataModelInventory: dm });
    const map = await extractEdges({ clonePath: dir, fileTree, routeInventory, dataModelInventory: dm, nodes, sourceByNodeId });
    const edges = flatten(map);
    expect(edges.some((e) => e.target === 'data_model.Us.r')).toBe(false);
  });
});

describe('extractEdges — read failures are surfaced (no longer swallowed)', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await fsp.rm(dir, { recursive: true, force: true });
  });

  it('counts + samples source files that fail to read', async () => {
    dir = await writeFixture([
      { path: 'app/real/page.tsx', content: `export default function P(){ return null; }` },
    ]);
    // `app/ghost/page.tsx` is inventoried but never written to disk → ENOENT.
    const fileTree = ['app/real/page.tsx', 'app/ghost/page.tsx'];
    const routeInventory = inv([
      PAGE('/real', 'app/real/page.tsx'),
      PAGE('/ghost', 'app/ghost/page.tsx'),
    ]);
    const { nodes, sourceByNodeId } = buildNodes({ fileTree, routeInventory, dataModelInventory: NONE_DM });
    const map = await extractEdges({
      clonePath: dir,
      fileTree,
      routeInventory,
      dataModelInventory: NONE_DM,
      nodes,
      sourceByNodeId,
    });
    expect(map.readFailures).toBe(1);
    expect(map.readFailureSamples.some((s) => s.includes('app/ghost/page.tsx'))).toBe(true);
  });

  it('reports zero read failures on the no-clonePath fast path', async () => {
    const fileTree = ['app/real/page.tsx'];
    const routeInventory = inv([PAGE('/real', 'app/real/page.tsx')]);
    const { nodes, sourceByNodeId } = buildNodes({ fileTree, routeInventory, dataModelInventory: NONE_DM });
    const map = await extractEdges({
      clonePath: '',
      fileTree,
      routeInventory,
      dataModelInventory: NONE_DM,
      nodes,
      sourceByNodeId,
    });
    expect(map.readFailures).toBe(0);
    expect(map.readFailureSamples).toEqual([]);
  });
});

describe('extractEdges — bounded-concurrency reads cover all candidates', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await fsp.rm(dir, { recursive: true, force: true });
  });

  it('reads every source file even when candidates exceed the concurrency limit', async () => {
    const N = 20; // > READ_CONCURRENCY (8)
    const files = Array.from({ length: N }, (_, i) => ({
      path: `app/p${i}/page.tsx`,
      content: `export default function P(){ fetch('/api/ghost${i}'); return null; }`,
    }));
    dir = await writeFixture(files);
    const fileTree = files.map((f) => f.path);
    const routeInventory = inv(files.map((f, i) => PAGE(`/p${i}`, f.path)));
    const { nodes, sourceByNodeId } = buildNodes({ fileTree, routeInventory, dataModelInventory: NONE_DM });
    const map = await extractEdges({
      clonePath: dir,
      fileTree,
      routeInventory,
      dataModelInventory: NONE_DM,
      nodes,
      sourceByNodeId,
    });
    const edges = flatten(map);
    const missing = edges.filter((e) => e.type === 'missing_link');
    expect(missing.length).toBe(N);
    expect(map.extraNodes.length).toBe(N);
    expect(map.readFailures).toBe(0);
  });
});
