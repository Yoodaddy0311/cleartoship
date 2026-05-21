// Concrete LSP client for typescript-language-server.
//
// Spawns the `typescript-language-server --stdio` child process, drives the
// LSP initialize/didOpen/documentSymbol/shutdown handshake on top of
// JsonRpcClient, and exposes the narrow `LspClient` surface to the rest of
// the worker. Phase 3+ (find_references, typeHierarchy) extends this same
// class.
//
// Source: PRD `lsp-backbone-2026-05-21.md` v2 §2 (P1.1, P1.2).

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { JsonRpcClient } from './client.js';
import type { LspClient } from './lsp-client-interface.js';
import {
  DocumentSymbolSchema,
  ServerCapabilitiesSchema,
  type DocumentSymbol,
  type ServerCapabilities,
} from './types.js';

const SERVER_BINARY = 'typescript-language-server';

// PRD §2 risk row — LSP cold start ~3-5s. 5 minute cap is the outer bound
// before we declare the server stuck and abort the step.
const COLD_START_TIMEOUT_MS = 5 * 60_000;

// Per-request timeout for documentSymbol. typescript-language-server usually
// answers in <100ms for small files; allow generous headroom for large
// generated files without letting a hang stall the whole pipeline.
const REQUEST_TIMEOUT_MS = 2_000;

export interface TypeScriptServerOptions {
  /**
   * Absolute path to the cloned repo root. Used as the LSP `rootUri` so
   * typescript-language-server resolves the project's tsconfig + dependencies
   * relative to it.
   */
  rootPath: string;

  /** Logger — same signature as `WorkerCtx.log`. */
  log: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void;

  /**
   * Hard cap on the parent Node + LSP child combined heap (MB). Wired in as
   * `--max-old-space-size` on the LSP child's argv. PRD §2 "v2 동시성 모델"
   * defaults this to 768MB to fit within Cloud Run's per-instance budget.
   */
  maxOldSpaceMb?: number;

  /**
   * Override the spawn binary — only used by unit tests that inject a fake
   * stdio process. Production code leaves this unset so the system PATH
   * resolves to the version pinned in the Dockerfile.
   */
  binary?: string;
}

export class TypeScriptLanguageServer implements LspClient {
  private readonly opts: TypeScriptServerOptions;
  private child: ChildProcessWithoutNullStreams | null = null;
  private rpc: JsonRpcClient | null = null;
  private serverCapabilities: ServerCapabilities | null = null;
  // Sequence number for synthetic `textDocument/didOpen` versions. LSP requires
  // a monotonically increasing integer per URI; since we open each file once
  // for a single documentSymbol call, we can reuse this counter globally.
  private openVersionCounter = 1;

  constructor(opts: TypeScriptServerOptions) {
    this.opts = opts;
  }

  async initialize(): Promise<void> {
    if (this.rpc !== null) {
      throw new Error('TypeScriptLanguageServer.initialize: already initialized');
    }

    const binary = this.opts.binary ?? SERVER_BINARY;
    const maxOldSpace = this.opts.maxOldSpaceMb ?? 768;
    const args = ['--stdio'];

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(binary, args, {
        cwd: this.opts.rootPath,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // LSP child runs as a Node process internally (tsserver fork);
          // propagate the heap cap there so we don't blow past Cloud Run's
          // per-instance RAM (PRD §2 v2 동시성 모델).
          NODE_OPTIONS: [
            process.env.NODE_OPTIONS ?? '',
            `--max-old-space-size=${maxOldSpace}`,
          ]
            .filter((s) => s.length > 0)
            .join(' '),
        },
      });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      throw new Error(
        `Failed to spawn ${binary}: ${code ?? 'unknown'} (${(err as Error).message})`,
      );
    }

    // Surface server stderr at info level — tsserver writes startup banners
    // and recoverable errors here. Anything fatal is matched separately on
    // child 'exit'.
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      const line = chunk.trim();
      if (line.length > 0) {
        this.opts.log('info', '[lsp/stderr]', { line: line.slice(0, 500) });
      }
    });

    // Capture early exit so the initialize promise rejects instead of hanging
    // until the cold-start timeout fires.
    let earlyExit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
    child.once('exit', (code, signal) => {
      earlyExit = { code, signal };
      this.opts.log('warn', 'LSP server exited', { code, signal });
    });

    this.child = child;
    this.rpc = new JsonRpcClient({ child, log: this.opts.log });

    const rootUri = pathToFileURL(this.opts.rootPath).toString();

    // PRD §2 — server may take 3-5s. Race the initialize against the hard
    // cap so we never block the pipeline forever on a stuck server.
    const initializeResponse = await withTimeout(
      this.rpc.request<unknown, { capabilities: unknown }>('initialize', {
        processId: process.pid,
        rootUri,
        workspaceFolders: [{ uri: rootUri, name: 'workspace' }],
        capabilities: {
          textDocument: {
            documentSymbol: {
              hierarchicalDocumentSymbolSupport: true,
            },
          },
        },
        initializationOptions: {
          // Disable tsserver's automatic .ts file watching — the audit only
          // queries each file once, so file-system events would just add
          // noise + memory overhead.
          preferences: { includePackageJsonAutoImports: 'off' },
        },
      }),
      COLD_START_TIMEOUT_MS,
      'LSP initialize',
    ).catch((err: Error) => {
      if (earlyExit) {
        throw new Error(
          `LSP server exited during initialize: code=${earlyExit.code} signal=${earlyExit.signal}`,
        );
      }
      throw err;
    });

    this.serverCapabilities = ServerCapabilitiesSchema.parse(initializeResponse.capabilities);
    this.rpc.notify('initialized', {});

    this.logMemoryUsage('after-initialize');
  }

  capabilities(): ServerCapabilities | null {
    return this.serverCapabilities;
  }

  async documentSymbol(
    absolutePath: string,
    languageId: string,
    text: string,
  ): Promise<DocumentSymbol[] | null> {
    if (this.rpc === null) {
      throw new Error('TypeScriptLanguageServer.documentSymbol: not initialized');
    }
    if (!this.serverCapabilities?.documentSymbolProvider) {
      // Graceful skip per PRD §2 (P1.3) — caller treats null as "skip this
      // file" rather than aborting the step.
      return null;
    }

    const uri = pathToFileURL(absolutePath).toString();
    const version = this.openVersionCounter++;

    this.rpc.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version, text },
    });

    try {
      const raw = await withTimeout(
        this.rpc.request<unknown, unknown>('textDocument/documentSymbol', {
          textDocument: { uri },
        }),
        REQUEST_TIMEOUT_MS,
        `documentSymbol(${absolutePath})`,
      );

      if (raw === null || raw === undefined) return null;
      if (!Array.isArray(raw)) {
        // typescript-language-server occasionally returns the flat
        // SymbolInformation[] variant for files it can't parse hierarchically.
        // Treat as empty so the file simply contributes 0 symbols rather
        // than crashing the step.
        this.opts.log('warn', 'LSP documentSymbol returned non-array', { path: absolutePath });
        return [];
      }

      const parsed: DocumentSymbol[] = [];
      for (const entry of raw) {
        const result = DocumentSymbolSchema.safeParse(entry);
        if (result.success) {
          parsed.push(result.data);
        }
        // Silently drop entries that don't match the hierarchical shape —
        // tsserver flat-fallback SymbolInformation lacks `selectionRange`.
      }
      return parsed;
    } finally {
      // Close the document so the server doesn't accumulate in-memory state
      // for thousands of files. didClose is a notification — no response to
      // await.
      this.rpc.notify('textDocument/didClose', { textDocument: { uri } });
    }
  }

  async shutdown(): Promise<void> {
    const rpc = this.rpc;
    const child = this.child;
    this.rpc = null;
    this.child = null;

    if (rpc !== null) {
      try {
        await withTimeout(
          rpc.request<unknown, unknown>('shutdown', null),
          2_000,
          'LSP shutdown',
        );
        rpc.notify('exit', null);
      } catch (err) {
        this.opts.log('warn', 'LSP shutdown handshake failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        rpc.dispose();
      }
    }

    if (child !== null && child.exitCode === null) {
      try {
        child.kill('SIGTERM');
      } catch {
        /* swallow — child already gone */
      }
    }

    this.logMemoryUsage('after-shutdown');
  }

  private logMemoryUsage(phase: string): void {
    // PRD §2 v2 — RSS 모니터링: 매 LSP 호출 후 logged so operators can spot
    // memory growth before it crosses the 768MB cap.
    const m = process.memoryUsage();
    this.opts.log('info', 'LSP memory snapshot', {
      phase,
      rssMb: Math.round(m.rss / (1024 * 1024)),
      heapUsedMb: Math.round(m.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(m.heapTotal / (1024 * 1024)),
      externalMb: Math.round(m.external / (1024 * 1024)),
    });
  }
}

/**
 * Race a promise against a timeout. Rejects with a labelled error so the
 * trace points at the actual LSP request that hung rather than an opaque
 * "timeout" message.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
