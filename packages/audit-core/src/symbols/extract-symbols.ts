// LSP DocumentSymbol → SymbolInventory converter (PRD `lsp-backbone-2026-05-21.md`
// v2 §3, Phase A P2).
//
// Pure function — takes a list of `(filePath, documentSymbols, sourceText)`
// records (whatever the worker collected from typescript-language-server) and
// folds them into the `SymbolInventory` shape that lands in Firestore +
// `state.symbolInventory`.
//
// No I/O, no LSP types — the worker maps the LSP-specific shape to the
// `RawSymbolNode` interface defined below before calling us so this module
// stays decoupled from the typescript-language-server response surface and
// the unit test can hand-craft fixtures without depending on the worker.

import {
  EMPTY_SYMBOL_INVENTORY,
  type Import,
  type Symbol as InventorySymbol,
  type SymbolInventory,
  type SymbolKindLabel,
  type SymbolRange,
  type SymbolTreeNode,
} from '@cleartoship/shared-types';

// ---------------------------------------------------------------------------
// LSP-agnostic input shape — worker maps the typescript-language-server
// `DocumentSymbol[]` response to this before calling extractSymbols(). LSP's
// numeric `SymbolKind` is normalised to a string label up-front so this
// module owns the audit-facing taxonomy (function | class | component |
// method | ...) rather than the worker.
// ---------------------------------------------------------------------------

export interface RawSymbolNode {
  /** Identifier as it appears in source. */
  name: string;
  /** LSP-derived kind label. Worker converts numeric SymbolKind → this. */
  kind: SymbolKindLabel;
  /** Whole-declaration range (LSP `range`). */
  range: SymbolRange;
  /** Identifier-only range (LSP `selectionRange`). */
  selectionRange: SymbolRange;
  /** Optional LSP `detail` string — used to detect `export …` declarations. */
  detail?: string;
  children?: RawSymbolNode[];
}

export interface RawFileSymbols {
  /** Repo-relative POSIX path. */
  filePath: string;
  /** Top-level RawSymbolNode array as returned by LSP for this file. */
  symbols: RawSymbolNode[];
  /**
   * Full file text — used to extract imports (cheap regex scan) and to
   * heuristic-detect components (PascalCase function returning JSX).
   * Pass an empty string to skip both heuristics.
   */
  sourceText: string;
}

// ---------------------------------------------------------------------------
// extractSymbols — top-level entry point. Returns a fully-populated
// SymbolInventory; never throws (errors degrade to "smaller inventory" so
// the soft-skip semantics at the pipeline-step level stay clean).
// ---------------------------------------------------------------------------

export interface ExtractSymbolsOptions {
  /**
   * Cap on entries kept in `summary.topModules`. PRD v2 confidence-typer
   * defaults to 20 (LLM context budget); tests override to a smaller value.
   */
  topModulesLimit?: number;
}

export function extractSymbols(
  files: readonly RawFileSymbols[],
  options: ExtractSymbolsOptions = {},
): SymbolInventory {
  if (files.length === 0) return { ...EMPTY_SYMBOL_INVENTORY };

  const limit = options.topModulesLimit ?? 20;

  const functions: InventorySymbol[] = [];
  const classes: InventorySymbol[] = [];
  const components: InventorySymbol[] = [];
  const imports: Import[] = [];
  const byFile: SymbolInventory['byFile'] = {};
  // Per-file symbol count — drives the topModules summary.
  const perFileSymbolCount = new Map<string, number>();

  for (const file of files) {
    let fileSymbolCount = 0;
    const tree: SymbolTreeNode[] = [];

    // Walk top-level symbols. Each is added to its category list AND mirrored
    // into the per-file tree (for the UI's RepoTreeView). Children are kept
    // in the tree but only their leaves get categorised (methods, properties,
    // etc.) so the flat arrays stay file-scope.
    for (const node of file.symbols) {
      tree.push(buildTreeNode(node));

      const flat = walkAndFlatten(node, file.filePath, file.sourceText);
      fileSymbolCount += flat.length;
      for (const entry of flat) {
        switch (entry.kind) {
          case 'function':
            functions.push(entry);
            break;
          case 'class':
            classes.push(entry);
            break;
          case 'component':
            // Components are also "functions" semantically (JSX-returning
            // function declarations); we keep them ONLY in `components` so
            // the dashboard counts don't double-count.
            components.push(entry);
            break;
          default:
            // method / property / interface / type / enum / variable /
            // other — counted toward the per-file symbol total but not
            // promoted into the flat category arrays (Phase A scope).
            break;
        }
      }
    }

    byFile[file.filePath] = { filePath: file.filePath, tree };
    perFileSymbolCount.set(file.filePath, fileSymbolCount);

    // Extract imports via regex (LSP doesn't surface them as DocumentSymbol
    // entries). Cheap pass since each source file is already in memory.
    if (file.sourceText.length > 0) {
      for (const imp of extractImports(file.sourceText, file.filePath)) {
        imports.push(imp);
      }
    }
  }

  const topModules = [...perFileSymbolCount.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([filePath]) => filePath);

  return {
    summary: {
      totalFunctions: functions.length,
      totalClasses: classes.length,
      totalComponents: components.length,
      totalImports: imports.length,
      topModules,
    },
    functions,
    classes,
    components,
    imports,
    byFile,
  };
}

// ---------------------------------------------------------------------------
// Helpers — kept private to this file. Exported via the barrel only if a
// downstream consumer ever needs them; for now they're implementation detail.
// ---------------------------------------------------------------------------

function buildTreeNode(node: RawSymbolNode): SymbolTreeNode {
  const out: SymbolTreeNode = {
    name: node.name,
    kind: node.kind,
    selectionRange: node.selectionRange,
    range: node.range,
  };
  if (node.children && node.children.length > 0) {
    out.children = node.children.map(buildTreeNode);
  }
  return out;
}

/**
 * Walk a RawSymbolNode tree and emit one `InventorySymbol` per node. The
 * walk preserves discovery order but collapses children into a flat list —
 * the caller decides which kinds to keep in the top-level arrays.
 *
 * `sourceText` is the entire source file string; we slice the declaration
 * range out of it to apply the component heuristic (JSX-returning
 * PascalCase function).
 */
function walkAndFlatten(
  node: RawSymbolNode,
  filePath: string,
  sourceText: string,
): InventorySymbol[] {
  const out: InventorySymbol[] = [];
  const isExported = looksExported(node, sourceText);
  const promotedKind = promoteKind(node, sourceText);

  out.push({
    filePath,
    name: node.name,
    kind: promotedKind,
    selectionRange: node.selectionRange,
    range: node.range,
    isExported,
  });

  if (node.children) {
    for (const child of node.children) {
      // Children inherit `isExported = false` by default — exports only
      // apply at the top level. The recursive walk doesn't propagate the
      // parent's flag because LSP's hierarchical symbol tree already nests
      // members inside their containing class/function.
      for (const grandchild of walkAndFlatten(child, filePath, sourceText)) {
        out.push(grandchild);
      }
    }
  }

  return out;
}

/**
 * `node.detail` is non-standard across LSP servers. typescript-language-
 * server emits the source-text snippet for the declaration in `detail`
 * sometimes but not always. Combine two signals:
 *   1. detail starts with `export ` (when present).
 *   2. the line preceding `selectionRange.start` (or the same line) starts
 *      with `export ` in the source.
 */
function looksExported(node: RawSymbolNode, sourceText: string): boolean {
  if (node.detail && /^export\b/.test(node.detail)) return true;
  if (sourceText.length === 0) return false;

  const lines = sourceText.split(/\r?\n/);
  const line = lines[node.selectionRange.start.line];
  if (line && /^\s*export\b/.test(line)) return true;
  // Some declarations span multiple lines (e.g. `export\nfunction foo()`).
  const prevLine = node.selectionRange.start.line > 0
    ? lines[node.selectionRange.start.line - 1]
    : null;
  if (prevLine && /^\s*export\s*$/.test(prevLine)) return true;

  return false;
}

/**
 * Component heuristic: a function-kind symbol whose name is PascalCase AND
 * whose declaration body contains `return` followed by either `<` (JSX) or
 * `React.createElement`. Anything else stays its original kind.
 *
 * Cheap text scan — slicing the source by character offset would require
 * line-to-offset math we don't otherwise need; line-window scan is plenty
 * accurate for the typical small component body.
 */
function promoteKind(node: RawSymbolNode, sourceText: string): SymbolKindLabel {
  if (node.kind !== 'function' && node.kind !== 'method') return node.kind;
  if (!/^[A-Z][A-Za-z0-9]*$/.test(node.name)) return node.kind;
  if (sourceText.length === 0) return node.kind;

  const lines = sourceText.split(/\r?\n/);
  const start = node.range.start.line;
  const end = Math.min(lines.length - 1, node.range.end.line);
  const body = lines.slice(start, end + 1).join('\n');
  if (/return\s*\(?\s*</.test(body) || /React\.createElement/.test(body)) {
    return 'component';
  }
  return node.kind;
}

const IMPORT_LINE_REGEX =
  /^\s*(?:import\b[^'"]*?from\s+|import\s+|export\b[^'"]*?from\s+)?['"]([^'"]+)['"]/;
const REQUIRE_LINE_REGEX = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/;

/**
 * Extract import specifiers via line-by-line regex. We deliberately don't
 * parse with a real ES module parser — the audit pipeline already pays the
 * cost of LSP for accurate analysis, and the import list here is consumed
 * as a Phase 3 seed for hallucinated-imports rather than as the SSOT.
 */
function extractImports(sourceText: string, filePath: string): Import[] {
  const out: Import[] = [];
  const lines = sourceText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Skip obvious non-imports early to cut regex cost on big files.
    if (!line.includes('import') && !line.includes('require')) continue;

    const importMatch = line.match(IMPORT_LINE_REGEX);
    if (importMatch && importMatch[1]) {
      const specifier = importMatch[1];
      out.push({
        filePath,
        specifier,
        isRelative: isRelativeSpecifier(specifier),
        line: i + 1,
      });
      continue;
    }
    const requireMatch = line.match(REQUIRE_LINE_REGEX);
    if (requireMatch && requireMatch[1]) {
      const specifier = requireMatch[1];
      out.push({
        filePath,
        specifier,
        isRelative: isRelativeSpecifier(specifier),
        line: i + 1,
      });
    }
  }
  return out;
}

function isRelativeSpecifier(spec: string): boolean {
  return spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('~');
}
