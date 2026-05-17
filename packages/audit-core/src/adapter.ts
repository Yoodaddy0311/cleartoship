// AuditToolAdapter — contract between the pipeline orchestrator and any
// concrete tool (Semgrep, OSV-Scanner, Lighthouse, ...). Lives in
// `audit-core` so the worker, the web app, and any future runner share a
// single source of truth for adapter shapes.
//
// Source: `firebase-architecture.md` §2/§10 + `05_technical_architecture_free_stack.md` §7.

import type {
  AuditCategory,
  Confidence,
  EvidenceType,
  Severity,
} from '@cleartoship/shared-types';

export interface WorkerCtx {
  runId: string;
  projectId: string;
  ownerId: string;
  repoUrl: string;
  deployUrl: string | null;
  prdText: string | null;
  /**
   * T2.4: domain audit profile id selected at audit start ('landing' | 'saas'
   * | 'ecommerce' | future ids). Null when the user didn't pick one, which
   * preserves spec-default scoring weights. Kept as a free string so adding
   * a profile in audit-core doesn't ripple through worker types.
   */
  profileId: string | null;
  /** Ephemeral clone path (always /tmp/clone-{runId}). Worker only. */
  clonePath: string | null;
  /** Logger function — structured JSON to stderr. */
  log: (
    level: 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>,
  ) => void;
}

/** Generic adapter interface used by every audit tool. */
export interface AuditToolAdapter<TInput = unknown, TRaw = unknown> {
  name: string;
  version: string;
  run(input: TInput, ctx: WorkerCtx): Promise<TRaw>;
  normalize(raw: TRaw, ctx: WorkerCtx): NormalizedFinding[];
}

/** Normalized finding shape — all adapters emit this before persistence. */
export interface NormalizedFinding {
  title: string;
  category: AuditCategory;
  severity: Severity;
  confidence: Confidence;
  summary: string;
  nonDeveloperExplanation: string | null;
  technicalExplanation: string | null;
  impact: string | null;
  recommendation: string | null;
  acceptanceCriteria: string[];
  tags: string[];
  evidences: NormalizedEvidence[];
}

export interface NormalizedEvidence {
  type: EvidenceType;
  source: string;
  path: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  url: string | null;
  selector: string | null;
  screenshotPath: string | null;
  snippet: string | null;
  maskedValue: string | null;
  metadata: Record<string, unknown> | null;
}
