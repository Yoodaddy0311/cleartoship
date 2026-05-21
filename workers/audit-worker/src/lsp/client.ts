// Low-level JSON-RPC transport around vscode-jsonrpc.
//
// vscode-jsonrpc handles the Content-Length framing + request/response
// correlation that LSP servers expect; we only adapt its API to the small
// promise-based surface our LSP server wrappers (typescript-server.ts)
// consume. Keeping this file thin and transport-only lets us swap to a raw
// JSON-RPC implementation later without touching server-specific code.
//
// PRD `lsp-backbone-2026-05-21.md` §11 L1 — `vscode-jsonrpc` chosen over the
// heavier `vscode-languageserver-protocol` (~30% smaller install footprint,
// no protocol-version assumptions baked into the lib).

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
  type NotificationType,
  type RequestType,
} from 'vscode-jsonrpc/node.js';

/**
 * Untyped JSON-RPC request descriptor. Most LSP methods are addressable by
 * their string name only — vscode-jsonrpc's typed `RequestType` is an extra
 * layer of ceremony we don't need for our small surface.
 */
export interface RpcRequest<TParams> {
  method: string;
  params: TParams;
}

export interface JsonRpcClientOptions {
  /** Already-spawned child process whose stdio we drive the connection from. */
  child: ChildProcessWithoutNullStreams;
  /** Logger — same signature as `WorkerCtx.log`. */
  log: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Minimal JSON-RPC client wrapped around a child process's stdio.
 *
 * Lifecycle:
 *   1. `new JsonRpcClient({ child, log })` — wires up the StreamMessageReader/
 *      Writer pair and calls `listen()` so messages start flowing.
 *   2. `request(method, params)` / `notify(method, params)` — typed wrappers
 *      around `connection.sendRequest` / `sendNotification`.
 *   3. `dispose()` — closes the underlying MessageConnection; the caller is
 *      responsible for actually killing the child process.
 */
export class JsonRpcClient {
  private readonly connection: MessageConnection;
  private readonly log: JsonRpcClientOptions['log'];
  private disposed = false;

  constructor(opts: JsonRpcClientOptions) {
    this.log = opts.log;
    const reader = new StreamMessageReader(opts.child.stdout);
    const writer = new StreamMessageWriter(opts.child.stdin);
    this.connection = createMessageConnection(reader, writer);

    // Surface any low-level protocol errors instead of letting them disappear
    // into the unhandledRejection bucket. We don't tear the connection down
    // here — typescript-server.ts owns lifecycle decisions.
    this.connection.onError(([error]) => {
      this.log('warn', 'LSP transport error', { error: error?.message ?? String(error) });
    });
    this.connection.onClose(() => {
      this.disposed = true;
    });

    this.connection.listen();
  }

  /**
   * Issue a typed request and await the server's response. The signature is
   * untyped on the wire — callers should `.parse()` the result with zod
   * before using it.
   */
  async request<TParams, TResult>(
    method: string,
    params: TParams,
  ): Promise<TResult> {
    if (this.disposed) {
      throw new Error(`JsonRpcClient.request: connection disposed (method=${method})`);
    }
    return this.connection.sendRequest<TResult>(method, params);
  }

  /**
   * Fire-and-forget notification. LSP uses notifications for didOpen /
   * didChange / exit; the server does not reply, so there's nothing to await
   * beyond the write completing.
   */
  notify<TParams>(method: string, params: TParams): void {
    if (this.disposed) {
      // Notifications post-dispose are a no-op — happens on the shutdown
      // path where we try to notify `exit` after shutdown closed the conn.
      return;
    }
    void this.connection.sendNotification(method, params);
  }

  /**
   * Close the JSON-RPC connection. Does NOT kill the underlying child
   * process — the spawning code owns that lifecycle (so it can decide
   * whether to SIGTERM gracefully or SIGKILL on timeout).
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.connection.dispose();
    } catch (err) {
      this.log('warn', 'JsonRpcClient.dispose threw', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Exposed for tests that need to register custom request handlers. */
  get raw(): MessageConnection {
    return this.connection;
  }
}

// Re-export the vscode-jsonrpc types our typed wrappers might use later.
// Right now the surface is untyped (string methods) which is fine for our
// small set of LSP calls.
export type { NotificationType, RequestType };
