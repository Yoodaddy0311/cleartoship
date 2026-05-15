import type {
  AuditCategory,
  CategoryScore,
  Finding,
  LaunchStatus,
  Severity,
} from '@cleartoship/shared-types';
import { CATEGORY_META, getCategoryMeta } from './checklist-mapping.js';

/**
 * Pure scoring per `03_audit_checklist_scoring_rubric.md` §13.
 *
 *   - Each category starts at 100 and is deducted per open finding.
 *   - P1 fail = -8, P2 = -4, P3 = -1.
 *   - Any P0 in a category caps that category at 60.
 *   - Overall = weighted average using CATEGORY_META weights.
 *   - If P0 count >= 3, launchStatus is forced to NOT_READY regardless of score.
 */

const SEVERITY_DEDUCTION: Record<Severity, number> = {
  P0: 0, // P0 uses the cap mechanism instead of a linear deduction.
  P1: 8,
  P2: 4,
  P3: 1,
};

const P0_CATEGORY_CAP = 60;

export interface ScoringInput {
  readonly findings: ReadonlyArray<Pick<Finding, 'category' | 'severity'>>;
}

export interface ScoringResult {
  readinessScore: number;
  launchStatus: LaunchStatus;
  categoryScores: CategoryScore[];
  severityCounts: Record<Severity, number>;
}

export function calculateScores(input: ScoringInput): ScoringResult {
  const severityCounts: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const perCategory = new Map<
    AuditCategory,
    { score: number; hasP0: boolean }
  >();

  for (const meta of CATEGORY_META) {
    perCategory.set(meta.category, { score: 100, hasP0: false });
  }

  for (const finding of input.findings) {
    severityCounts[finding.severity] += 1;
    const bucket = perCategory.get(finding.category);
    if (!bucket) continue;
    if (finding.severity === 'P0') {
      bucket.hasP0 = true;
    } else {
      bucket.score = Math.max(0, bucket.score - SEVERITY_DEDUCTION[finding.severity]);
    }
  }

  // Apply P0 cap.
  for (const bucket of perCategory.values()) {
    if (bucket.hasP0) {
      bucket.score = Math.min(bucket.score, P0_CATEGORY_CAP);
    }
  }

  // Weighted overall.
  let weightedSum = 0;
  let totalWeight = 0;
  const categoryScores: CategoryScore[] = [];
  for (const meta of CATEGORY_META) {
    const bucket = perCategory.get(meta.category);
    if (!bucket) continue;
    if (meta.weight > 0) {
      weightedSum += bucket.score * meta.weight;
      totalWeight += meta.weight;
    }
    categoryScores.push({
      category: meta.category,
      score: Math.round(bucket.score),
      label: meta.label,
      summary: null,
    });
  }

  const readinessScore =
    totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);
  const launchStatus = classifyLaunchStatus(readinessScore, severityCounts.P0);

  return { readinessScore, launchStatus, categoryScores, severityCounts };
}

function classifyLaunchStatus(score: number, p0Count: number): LaunchStatus {
  if (p0Count >= 3) return 'NOT_READY';
  if (score >= 85) return 'READY';
  if (score >= 70) return 'CONDITIONAL';
  if (score >= 55) return 'NEEDS_WORK';
  if (score >= 40) return 'AT_RISK';
  return 'NOT_READY';
}
