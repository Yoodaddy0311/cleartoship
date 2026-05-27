// Audit Quality Roadmap §4.1 — 7-Question Launch Gate.
//
// Adapted from Claude-BugHunter's 7-Question Gate (triage-validation/SKILL.md),
// which converts a stack of partial signals into a single, defensible verdict
// with a one-NO-can-kill discipline. ClearToShip maps the same idea onto
// launch readiness: the existing LAUNCH_READINESS category produces a 0–100
// number, but a non-developer founder needs a crisp "출시해도 되나?" answer.
//
// The 7 questions draw only on D-bucket (deterministic) evidence the pipeline
// already produces — README/LICENSE/CI presence (W1-A), P0 finding count,
// deploy reachability + Lighthouse-derived UX score, and the SECURITY_PRIVACY
// / BUSINESS_READINESS category scores. No LLM. The verdict is therefore
// reproducible for the same commit.
//
// This module is the *persisted data shape*. The evaluation logic lives in
// `@cleartoship/audit-core` (`launch-gate/seven-question-gate.ts`) so the
// worker and the web app share one source of truth without the web app
// pulling in scoring code.

import { z } from 'zod';

/** The seven gate question identifiers (see §4.1 mapping table). */
export const LaunchQuestionIdSchema = z.enum([
  'Q1', // README + production claim
  'Q2', // License (+ CONTRIBUTING when available)
  'Q3', // CI config + tests present
  'Q4', // Zero P0 findings
  'Q5', // Deploy URL reachable + Lighthouse/UX pass
  'Q6', // Security audit clean (SECURITY_PRIVACY ≥ 70)
  'Q7', // Business readiness (BUSINESS_READINESS ≥ 70)
]);
export type LaunchQuestionId = z.infer<typeof LaunchQuestionIdSchema>;

/**
 * Per-question answer. UNKNOWN is distinct from NO: it means the evidence to
 * answer the question never arrived (e.g. no deploy URL → Lighthouse never
 * ran), which must not be conflated with a confident failure.
 */
export const LaunchAnswerSchema = z.enum(['YES', 'NO', 'UNKNOWN']);
export type LaunchAnswer = z.infer<typeof LaunchAnswerSchema>;

export const LaunchQuestionSchema = z.object({
  id: LaunchQuestionIdSchema,
  /** Human-readable question text (Korean — non-developer audience). */
  question: z.string(),
  answer: LaunchAnswerSchema,
  /** Evidence strings backing the answer (file markers, scores, counts). */
  evidence: z.array(z.string()),
});
export type LaunchQuestion = z.infer<typeof LaunchQuestionSchema>;

/**
 * 4-state verdict (CBH PASS/DOWNGRADE/CHAIN/KILL → launch semantics):
 *   READY       — all seven YES.
 *   CONDITIONAL — only minor questions (Q5/Q6/Q7) failed, or some checks
 *                 could not run (UNKNOWN) but nothing failed outright.
 *   FIX_FIRST   — a foundation question (Q1/Q2/Q3) failed.
 *   BLOCK       — Q4 failed: at least one P0 blocker exists.
 */
export const LaunchVerdictSchema = z.enum([
  'READY',
  'CONDITIONAL',
  'FIX_FIRST',
  'BLOCK',
]);
export type LaunchVerdict = z.infer<typeof LaunchVerdictSchema>;

export const LaunchGateResultSchema = z.object({
  questions: z.array(LaunchQuestionSchema).length(7),
  verdict: LaunchVerdictSchema,
  /** One-line Korean rationale summarising the YES/NO/UNKNOWN tally + driver. */
  rationale: z.string(),
});
export type LaunchGateResult = z.infer<typeof LaunchGateResultSchema>;

/** Korean verdict labels for the dashboard chip. */
export const LAUNCH_VERDICT_LABELS_KO: Record<LaunchVerdict, string> = {
  READY: '출시 준비 완료',
  CONDITIONAL: '조건부 출시 가능',
  FIX_FIRST: '기반 보완 우선',
  BLOCK: '출시 차단 (P0 존재)',
};

/** Emoji / status colour hint for the chip, per §4.1 UI spec. */
export const LAUNCH_VERDICT_TONE: Record<
  LaunchVerdict,
  { emoji: string; tone: 'success' | 'warning' | 'danger' | 'blocked' }
> = {
  READY: { emoji: '🟢', tone: 'success' },
  CONDITIONAL: { emoji: '🟡', tone: 'warning' },
  FIX_FIRST: { emoji: '🔴', tone: 'danger' },
  BLOCK: { emoji: '⛔', tone: 'blocked' },
};
