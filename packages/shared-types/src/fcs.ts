import { z } from 'zod';
import { Confidence, Severity } from './enums.js';
import { LaunchStatus } from './domain.js';

// Wave 1 W1.1 — Founder Confidence Score (FCS).
// FCS is a single 0~100 metric + (lower, upper) interval + LaunchStatus +
// up-to-3 top concerns. Computed by audit-core (W1.2) and surfaced on the
// dashboard (W1.4). `.strict()` rejects unknown keys so worker / generator
// drift surfaces at parse time.

export const ConcernSchema = z
  .object({
    findingId: z.string().min(1),
    severity: Severity,
    confidence: Confidence,
    impact: z.number(),
    ruleFamily: z.string().min(1),
  })
  .strict();
export type Concern = z.infer<typeof ConcernSchema>;

export const FCSResultSchema = z
  .object({
    score: z.number().min(0).max(100),
    lower: z.number().min(0).max(100),
    upper: z.number().min(0).max(100),
    uncertainty: z.number().min(0).max(30),
    status: LaunchStatus,
    topConcerns: z.array(ConcernSchema).max(3),
    rationale: z.string().min(1),
  })
  .strict();
export type FCSResult = z.infer<typeof FCSResultSchema>;
