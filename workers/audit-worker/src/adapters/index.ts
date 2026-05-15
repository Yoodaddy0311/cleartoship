// Worker-local barrel for adapter contracts + concrete tool adapters.
//
// The contract types (`AuditToolAdapter`, `NormalizedFinding`,
// `NormalizedEvidence`, `WorkerCtx`) now live in `@cleartoship/audit-core`
// so any runner (this worker, the web app, a future scheduled job) can
// satisfy the same shape. This file re-exports them so existing imports
// keep working, and is where concrete adapter implementations (Semgrep,
// OSV-Scanner, Lighthouse, mocks) will be wired in Sprint 1+.
//
// Source: `firebase-architecture.md` §2/§10.

export type {
  AuditToolAdapter,
  NormalizedEvidence,
  NormalizedFinding,
  WorkerCtx,
} from '@cleartoship/audit-core';
