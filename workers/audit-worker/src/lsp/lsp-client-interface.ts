// LspClient abstraction — what pipeline steps consume.
//
// Concrete implementation lives in `typescript-server.ts` (spawns
// typescript-language-server). Unit tests provide a mock that implements this
// interface against simulated stdout chunks — see `extract-symbols.test.ts`.
//
// The interface is intentionally narrow: only the LSP methods our P1+P2 work
// actually calls. Phase 3+ adds `references()` and `typeHierarchy()`; until
// then we keep the surface small so the mock has less to forge.
//
// Source: PRD `lsp-backbone-2026-05-21.md` v2 §2 (P1.3 — graceful skip).

import type { DocumentSymbol, ServerCapabilities } from './types.js';

export interface LspClient {
  /**
   * Drive the LSP `initialize` handshake. Resolves once the server replies
   * with its capabilities so callers can branch on graceful-skip behavior
   * (PRD §2 — "soft skip + N/A" pattern). Throws on cold-start timeout.
   */
  initialize(): Promise<void>;

  /**
   * Capabilities reported by the server during `initialize`. Returns null
   * before `initialize()` has completed; once populated stays stable for the
   * lifetime of the client. Callers that need a capability (e.g.
   * documentSymbol) check the field first and SKIP gracefully instead of
   * crashing the pipeline.
   */
  capabilities(): ServerCapabilities | null;

  /**
   * Send `textDocument/didOpen` + `textDocument/documentSymbol` for the given
   * file. Returns the hierarchical DocumentSymbol tree the server produced,
   * or `null` when the server replied with `null`/empty (file is empty or
   * contains parse errors that prevent symbol extraction).
   *
   * @param absolutePath Absolute filesystem path; converted to `file://` URI
   *                     internally so callers don't need to know the LSP wire
   *                     format.
   * @param languageId  LSP language id ('typescript' | 'typescriptreact' |
   *                    'javascript' | 'javascriptreact').
   * @param text        File contents — sent via didOpen so the server has a
   *                    document to query before documentSymbol fires.
   */
  documentSymbol(
    absolutePath: string,
    languageId: string,
    text: string,
  ): Promise<DocumentSymbol[] | null>;

  /**
   * Send `shutdown` + `exit` and reap the child process. Idempotent — safe to
   * call after a crash or in a finally block.
   */
  shutdown(): Promise<void>;
}
