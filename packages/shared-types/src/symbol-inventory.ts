// LSP-derived Symbol Inventory — Phase A P2 (PRD `lsp-backbone-2026-05-21.md`
// v2 §3).
//
// The audit worker calls typescript-language-server's
// `textDocument/documentSymbol` for every TS/JS file in the cloned repo and
// folds the responses into this shape. Downstream consumers:
//   - audit report renderer surfaces `summary.*` totals in the dashboard chip
//   - Symbol Explorer UI page (Phase G) reads `byFile` for the RepoTreeView
//   - Phase 3+ plug-ins (hallucinated-imports / dead-code / type-aware
//     diagnostics) read `imports` + `functions` for cross-reference seeds
//
// Field decisions per PRD v2 (confidence-typer + plugin-architect):
//   - `summary` exists so the LLM context isn't flooded with thousands of
//     `functions[]` entries when only the totals are needed for scoring.
//   - `byFile` is the Serena `symbol_overview` pattern — per-file tree the
//     UI's RepoTreeView consumes directly.
//   - Schema scope is TS/JS only. Vue/Svelte/Astro SFCs are Phase 7+.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Position / Range — mirrors LSP types but lives in shared-types so the UI
// can import them without depending on the worker. (The worker has its own
// matching `PositionSchema` in `workers/audit-worker/src/lsp/types.ts` —
// validate-once-then-pass-through semantics, no cross-package coupling.)
// ---------------------------------------------------------------------------

export const SymbolPositionSchema = z.object({
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
});
export type SymbolPosition = z.infer<typeof SymbolPositionSchema>;

export const SymbolRangeSchema = z.object({
  start: SymbolPositionSchema,
  end: SymbolPositionSchema,
});
export type SymbolRange = z.infer<typeof SymbolRangeSchema>;

// ---------------------------------------------------------------------------
// SymbolKind — narrow audit-facing taxonomy. We deliberately don't surface
// LSP's full 26-entry enum; downstream consumers only need to distinguish
// the categories that map to audit findings (functions vs. classes vs.
// component declarations vs. everything else).
// ---------------------------------------------------------------------------

export const SymbolKindLabelSchema = z.enum([
  'function',
  'class',
  'component', // React/Vue component — heuristic on `kind === Function` + PascalCase + JSX-return
  'method',
  'property',
  'interface',
  'type',
  'enum',
  'variable',
  'other',
]);
export type SymbolKindLabel = z.infer<typeof SymbolKindLabelSchema>;

// ---------------------------------------------------------------------------
// SymbolSchema — top-level shape for the `functions` / `classes` /
// `components` arrays. `filePath` is repo-relative (POSIX) so the same
// inventory renders correctly on Linux Cloud Run + Windows dev machines.
// ---------------------------------------------------------------------------

export const SymbolSchema = z.object({
  /** Repo-relative POSIX path of the file declaring the symbol. */
  filePath: z.string(),
  /** Identifier as it appears in source. */
  name: z.string(),
  /** Coarse audit-facing classification (see SymbolKindLabelSchema). */
  kind: SymbolKindLabelSchema,
  /** LSP `selectionRange` — the identifier itself, not the whole body. */
  selectionRange: SymbolRangeSchema,
  /** LSP `range` — the entire declaration including body. */
  range: SymbolRangeSchema,
  /**
   * Whether this symbol is exported from its file. Heuristic — based on
   * LSP `detail` text. Used as a Phase 3 dead-code seed (only exported
   * symbols are candidates for cross-file reference lookup).
   */
  isExported: z.boolean(),
});
export type Symbol = z.infer<typeof SymbolSchema>;

// ---------------------------------------------------------------------------
// ImportSchema — one entry per `import …` / `require(…)` statement found in
// the file. Phase 1 V1 hallucinated-imports check (PRD §4) reads this to
// seed LSP resolution attempts; Phase A keeps the data without acting on it.
// ---------------------------------------------------------------------------

export const ImportSchema = z.object({
  /** Repo-relative POSIX path of the importing file. */
  filePath: z.string(),
  /**
   * The literal module specifier exactly as written
   * (`react`, `./utils.js`, `@scope/pkg/sub`).
   */
  specifier: z.string(),
  /**
   * `true` when the specifier looks like a relative path
   * (`.` / `..` / `~/` / absolute) — useful for distinguishing first-party
   * vs. package imports without parsing tsconfig paths.
   */
  isRelative: z.boolean(),
  /** Line number (1-indexed for human-friendly evidence rendering). */
  line: z.number().int().positive(),
});
export type Import = z.infer<typeof ImportSchema>;

// ---------------------------------------------------------------------------
// SymbolTreeNodeSchema — recursive per-file tree (PRD v2 `byFile`). Mirrors
// LSP's hierarchical DocumentSymbol but trimmed to the fields the
// RepoTreeView UI cares about. `children` is optional so leaves stay small.
// ---------------------------------------------------------------------------

export interface SymbolTreeNode {
  name: string;
  kind: SymbolKindLabel;
  selectionRange: SymbolRange;
  range: SymbolRange;
  children?: SymbolTreeNode[];
}

export const SymbolTreeNodeSchema: z.ZodType<SymbolTreeNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    kind: SymbolKindLabelSchema,
    selectionRange: SymbolRangeSchema,
    range: SymbolRangeSchema,
    children: z.array(SymbolTreeNodeSchema).optional(),
  }),
);

// ---------------------------------------------------------------------------
// SymbolInventorySchema — top-level shape persisted to Firestore +
// `state.symbolInventory`. PRD v2 §3 prescribes `summary` for LLM-context
// safety + `byFile` for UI consumption.
// ---------------------------------------------------------------------------

export const SymbolInventorySummarySchema = z.object({
  totalFunctions: z.number().int().nonnegative(),
  totalClasses: z.number().int().nonnegative(),
  totalComponents: z.number().int().nonnegative(),
  totalImports: z.number().int().nonnegative(),
  /**
   * Up to 20 file paths that contain the most symbols — the "hot files"
   * the dashboard surfaces for navigation. Cap of 20 protects the LLM
   * context budget (PRD v2 confidence-typer review §AXIS 2).
   */
  topModules: z.array(z.string()).max(20),
});
export type SymbolInventorySummary = z.infer<typeof SymbolInventorySummarySchema>;

export const SymbolInventoryByFileEntrySchema = z.object({
  filePath: z.string(),
  tree: z.array(SymbolTreeNodeSchema),
});
export type SymbolInventoryByFileEntry = z.infer<typeof SymbolInventoryByFileEntrySchema>;

export const SymbolInventorySchema = z.object({
  summary: SymbolInventorySummarySchema,
  functions: z.array(SymbolSchema),
  classes: z.array(SymbolSchema),
  components: z.array(SymbolSchema),
  imports: z.array(ImportSchema),
  /**
   * Keyed by repo-relative filePath so the UI can look up trees without a
   * linear scan. PRD v2 plugin-architect — exact shape required for the
   * Phase G Symbol Explorer page.
   */
  byFile: z.record(z.string(), SymbolInventoryByFileEntrySchema),
});
export type SymbolInventory = z.infer<typeof SymbolInventorySchema>;

/**
 * Empty inventory used as the default `state.symbolInventory` value (so the
 * pipeline doesn't have to branch on null) and as the soft-skip result when
 * the LSP server is unavailable. All counts are zero, all arrays/records are
 * empty — the scorer treats this identically to "step did not run" via the
 * separate `executedSteps` channel.
 */
export const EMPTY_SYMBOL_INVENTORY: SymbolInventory = {
  summary: {
    totalFunctions: 0,
    totalClasses: 0,
    totalComponents: 0,
    totalImports: 0,
    topModules: [],
  },
  functions: [],
  classes: [],
  components: [],
  imports: [],
  byFile: {},
};
