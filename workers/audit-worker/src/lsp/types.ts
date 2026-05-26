// LSP wire-shape mirrors — zod schemas for the small subset of the Language
// Server Protocol our audit pipeline consumes. The full protocol is huge; we
// only model what `documentSymbol` and lifecycle messages return so the rest
// of the pipeline can `.parse()` LSP responses with type-safety and reject
// drift instead of casting to `any`.
//
// Source: PRD `lsp-backbone-2026-05-21.md` v2 §2 (Phase 1 P1.4).
//         LSP spec — https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Position / Range — used everywhere (symbols, diagnostics, references)
// ---------------------------------------------------------------------------

export const PositionSchema = z.object({
  // Zero-based line number per LSP spec.
  line: z.number().int().nonnegative(),
  // Zero-based UTF-16 code-unit offset within the line.
  character: z.number().int().nonnegative(),
});
export type Position = z.infer<typeof PositionSchema>;

export const RangeSchema = z.object({
  start: PositionSchema,
  end: PositionSchema,
});
export type Range = z.infer<typeof RangeSchema>;

// ---------------------------------------------------------------------------
// SymbolKind — LSP enum 1..26. We keep the numeric form on the wire (LSP's
// canonical encoding) and expose a name lookup so downstream renderers can
// label symbols without re-implementing the mapping.
// ---------------------------------------------------------------------------

export const SymbolKindSchema = z.number().int().min(1).max(26);
export type SymbolKind = z.infer<typeof SymbolKindSchema>;

export const SYMBOL_KIND_NAMES: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter',
};

// ---------------------------------------------------------------------------
// DocumentSymbol — the hierarchical response shape from
// `textDocument/documentSymbol`. typescript-language-server always returns
// this hierarchical variant for TS/JS files (not the flat SymbolInformation
// fallback), so we model only this one and reject anything else.
//
// Recursive types in zod require `z.lazy` — see
// https://zod.dev/?id=recursive-types
// ---------------------------------------------------------------------------

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export const DocumentSymbolSchema: z.ZodType<DocumentSymbol> = z.lazy(() =>
  z.object({
    name: z.string(),
    detail: z.string().optional(),
    kind: SymbolKindSchema,
    range: RangeSchema,
    selectionRange: RangeSchema,
    children: z.array(DocumentSymbolSchema).optional(),
  }),
);

// ---------------------------------------------------------------------------
// ServerCapabilities — the subset of LSP's `initialize` response we actually
// branch on. typescript-language-server returns many more fields; we model a
// tiny slice and pass-through the rest as unknown so the schema stays
// permissive across LSP version bumps.
// ---------------------------------------------------------------------------

export const ServerCapabilitiesSchema = z
  .object({
    // typescript-language-server publishes this as `true` or as an object;
    // we accept both since we only call documentSymbol/references when the
    // value is truthy.
    documentSymbolProvider: z.union([z.boolean(), z.record(z.unknown())]).optional(),
    referencesProvider: z.union([z.boolean(), z.record(z.unknown())]).optional(),
    typeHierarchyProvider: z.union([z.boolean(), z.record(z.unknown())]).optional(),
    // textDocumentSync can be number (legacy) or object — keep both.
    textDocumentSync: z.union([z.number(), z.record(z.unknown())]).optional(),
  })
  .passthrough();
export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;
