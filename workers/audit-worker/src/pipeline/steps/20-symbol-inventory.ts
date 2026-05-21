// SYMBOL_INVENTORY — Phase A P2 (PRD `lsp-backbone-2026-05-21.md` v2 §3).
//
// Spawns typescript-language-server against the cloned repo, calls
// `textDocument/documentSymbol` for every relevant TS/JS file (up to
// `maxFiles`), and folds the results into `state.symbolInventory` via the
// pure `extractSymbols` reducer in audit-core.
//
// Soft-skip semantics (PRD §11 L5 — `requires` field pattern):
//   - clonePath missing       → SKIPPED, empty inventory remains
//   - LSP binary missing       → SKIPPED + tool result + empty inventory
//   - initialize timeout/crash → SKIPPED + tool result + empty inventory
//   - per-file LSP error       → that file contributes nothing; we keep going
//
// `recordStepOutcome(state, 'SYMBOL_INVENTORY', 'CHECKPOINT')` runs ONLY on
// the success path so the scorer's BUG-1 invariant holds: a skipped step
// must not contribute measurement signals.

import path from 'node:path';
import { promises as fsp } from 'node:fs';

import type { Step } from './index.js';
import { writeToolResult } from '../../firestore/writers.js';
import { recordStepOutcome } from '../lib/record-step-outcome.js';
import {
  extractSymbols,
  type RawFileSymbols,
  type RawSymbolNode,
} from '@cleartoship/audit-core';
import { SYMBOL_KIND_NAMES } from '../../lsp/types.js';
import type { DocumentSymbol } from '../../lsp/types.js';
import type { SymbolKindLabel } from '@cleartoship/shared-types';

// vscode-jsonrpc + the TypeScriptLanguageServer wrapper are lazy-imported
// inside execute(). Top-level loading pulls in vscode-jsonrpc which is
// substantial CJS — keeping it out of the module graph until the step
// actually runs cuts cold-start time on every other step that imports the
// registry (including tests that just want to read STEP_REGISTRY metadata).

const TOOL_NAME = 'typescript-language-server';

// PRD §3 v2 budget — default 500 files. Config override path (cleartoship.config.json
// `lsp.maxFiles`) lives in audit-quality-framework §B.3 and lands in Phase B.
const DEFAULT_MAX_FILES = 500;

// PRD §3 v2 priority — `src/`, `app/`, `pages/`, `lib/` first, then everything else.
const PRIORITY_DIRS = ['src/', 'app/', 'pages/', 'lib/'] as const;

// Files we never want to index. Generated / vendored content is noise and
// inflates LSP memory + wall-clock with zero audit value.
const EXCLUDE_DIR_REGEX = /(^|\/)(node_modules|\.git|dist|build|out|\.next|coverage)(\/|$)/;
const FILE_EXT_REGEX = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

export const step20SymbolInventory: Step = {
  step: 'SYMBOL_INVENTORY',
  async execute(ctx, state) {
    if (!ctx.clonePath) {
      ctx.log('warn', 'Symbol inventory skipped — no clone path');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: TOOL_NAME,
        toolVersion: 'n/a',
        status: 'SKIPPED',
        rawSummary: { reason: 'no clone path' },
        artifactPath: null,
      });
      return;
    }

    const candidates = selectCandidateFiles(state.fileTree, DEFAULT_MAX_FILES);
    if (candidates.length === 0) {
      ctx.log('info', 'Symbol inventory skipped — no TS/JS files in tree');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: TOOL_NAME,
        toolVersion: 'n/a',
        status: 'SKIPPED',
        rawSummary: { reason: 'no eligible files' },
        artifactPath: null,
      });
      return;
    }

    // Lazy-load the LSP server wrapper so the module graph doesn't pay the
    // vscode-jsonrpc parse cost on every registry import (see top comment).
    const { TypeScriptLanguageServer } = await import('../../lsp/typescript-server.js');
    const server = new TypeScriptLanguageServer({
      rootPath: ctx.clonePath,
      log: ctx.log,
    });

    try {
      await server.initialize();
    } catch (err) {
      ctx.log('warn', 'LSP initialize failed — skipping symbol inventory', {
        error: err instanceof Error ? err.message : String(err),
      });
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: TOOL_NAME,
        toolVersion: 'unknown',
        status: 'SKIPPED',
        rawSummary: {
          reason: 'LSP initialize failed',
          error: err instanceof Error ? err.message : String(err),
        },
        artifactPath: null,
      });
      // Reap the child if it half-spawned.
      await server.shutdown().catch(() => {
        /* swallow — already noisy enough */
      });
      return;
    }

    const rawFiles: RawFileSymbols[] = [];
    let errors = 0;

    try {
      for (const relativePath of candidates) {
        const absolutePath = path.join(ctx.clonePath, relativePath);
        let sourceText = '';
        try {
          sourceText = await fsp.readFile(absolutePath, 'utf8');
        } catch (err) {
          // File may have been pruned by step03's clone filter post-fileTree.
          ctx.log('warn', 'symbol-inventory: read failed', {
            path: relativePath,
            error: err instanceof Error ? err.message : String(err),
          });
          errors++;
          continue;
        }

        const languageId = pickLanguageId(relativePath);
        let lspSymbols: DocumentSymbol[] | null;
        try {
          lspSymbols = await server.documentSymbol(absolutePath, languageId, sourceText);
        } catch (err) {
          ctx.log('warn', 'symbol-inventory: documentSymbol failed', {
            path: relativePath,
            error: err instanceof Error ? err.message : String(err),
          });
          errors++;
          continue;
        }
        if (lspSymbols === null) {
          // Server signalled "no symbols" — still record the file with an
          // empty list so the byFile tree shows it (the UI uses presence in
          // the inventory as "we looked at this file").
          rawFiles.push({ filePath: relativePath, symbols: [], sourceText });
          continue;
        }

        rawFiles.push({
          filePath: relativePath,
          symbols: lspSymbols.map((s) => toRawNode(s)),
          sourceText,
        });
      }
    } finally {
      await server.shutdown().catch((err: Error) => {
        ctx.log('warn', 'LSP shutdown threw (non-fatal)', { error: err.message });
      });
    }

    const inventory = extractSymbols(rawFiles);
    state.symbolInventory = inventory;

    await writeToolResult({
      auditRunId: ctx.runId,
      toolName: TOOL_NAME,
      toolVersion: 'unknown',
      status: errors > 0 && rawFiles.length === 0 ? 'FAILED' : 'SUCCESS',
      rawSummary: {
        filesScanned: rawFiles.length,
        filesErrored: errors,
        ...inventory.summary,
      },
      artifactPath: null,
    });

    // BUG-1: only mark SYMBOL_INVENTORY as executed on the success path.
    // The skip branches above already returned without pushing.
    recordStepOutcome(state, 'SYMBOL_INVENTORY', 'CHECKPOINT');

    ctx.log('info', 'Symbol inventory complete', {
      filesScanned: rawFiles.length,
      filesErrored: errors,
      totalFunctions: inventory.summary.totalFunctions,
      totalClasses: inventory.summary.totalClasses,
      totalComponents: inventory.summary.totalComponents,
      totalImports: inventory.summary.totalImports,
    });
  },
};

// ---------------------------------------------------------------------------
// File selection + normalisation helpers — kept colocated with the step
// since they're tightly coupled to its config (maxFiles, priority dirs).
// ---------------------------------------------------------------------------

function selectCandidateFiles(fileTree: readonly string[], maxFiles: number): string[] {
  const eligible = fileTree.filter(
    (p) => FILE_EXT_REGEX.test(p) && !EXCLUDE_DIR_REGEX.test(p),
  );
  if (eligible.length <= maxFiles) return eligible;

  // PRD §3 priority — files under src/ / app/ / pages/ / lib/ first.
  const priority = eligible.filter((p) => PRIORITY_DIRS.some((d) => p.startsWith(d)));
  const rest = eligible.filter((p) => !PRIORITY_DIRS.some((d) => p.startsWith(d)));
  return [...priority, ...rest].slice(0, maxFiles);
}

function pickLanguageId(filePath: string): string {
  if (filePath.endsWith('.tsx')) return 'typescriptreact';
  if (filePath.endsWith('.ts')) return 'typescript';
  if (filePath.endsWith('.jsx')) return 'javascriptreact';
  // .js / .mjs / .cjs — all served by typescript-language-server in JS mode.
  return 'javascript';
}

/**
 * Map LSP `DocumentSymbol` → audit-core's `RawSymbolNode`. The numeric
 * SymbolKind is collapsed to the small audit taxonomy here so extractSymbols
 * doesn't need to know LSP wire constants.
 */
function toRawNode(node: DocumentSymbol): RawSymbolNode {
  const kindName = SYMBOL_KIND_NAMES[node.kind] ?? 'other';
  const kind = lspKindToInventoryKind(kindName);
  const out: RawSymbolNode = {
    name: node.name,
    kind,
    range: node.range,
    selectionRange: node.selectionRange,
  };
  if (node.detail !== undefined) {
    out.detail = node.detail;
  }
  if (node.children && node.children.length > 0) {
    out.children = node.children.map(toRawNode);
  }
  return out;
}

function lspKindToInventoryKind(kindName: string): SymbolKindLabel {
  // Mapping is intentionally lossy — we only carry kinds the audit acts on.
  switch (kindName) {
    case 'Function':
      return 'function';
    case 'Class':
      return 'class';
    case 'Method':
    case 'Constructor':
      return 'method';
    case 'Property':
    case 'Field':
      return 'property';
    case 'Interface':
      return 'interface';
    case 'Enum':
    case 'EnumMember':
      return 'enum';
    case 'Variable':
    case 'Constant':
      return 'variable';
    // Module, Namespace, Package, File, etc. — all map to "other" so
    // they're tracked in the tree but not in the flat category arrays.
    default:
      return 'other';
  }
}
