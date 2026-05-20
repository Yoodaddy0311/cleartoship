// V3 Strengths Panel — 2026-05-20
//
// Surfaces the *positive* signals from an audit run as equal-weight cards
// alongside the existing defect-oriented sections (severity counts, category
// scores). The defect-first dashboard layout was leaving non-dev founders
// with a "everything is broken" impression even when the run had genuine
// strengths — confirmed by 2026-05-20 user feedback after the first 54-score
// prod self-audit.
//
// Source of strengths (MVP, derived from existing report data — no new
// pipeline plumbing required):
//   1. severityCounts: P0 (Critical) === 0  → "Critical 취약점 0건"
//   2. severityCounts: P1 (High) === 0      → "High 취약점 0건"
//   3. categoryScores: every category with score >= 80 (and not null/N/A)
//
// Out of scope (Phase 2 candidates documented in
// .claude/memory/project_visual_audit_vision.md):
//   - Per-tool "PASS" strengths (data not yet exposed in the report shape)
//   - Screenshot thumbnails on strength cards
//   - Comparison-with-previous-run "improved" strengths
//
// The panel renders nothing when no strengths exist — we prefer empty over
// a placeholder "no strengths yet" message because that placeholder itself
// would re-introduce the negative framing this panel is trying to remove.

import { Card, CardBody } from '@cleartoship/ui';
import type { Severity } from '@/lib/format/severity';
import type { adaptCategoryScoresNullable } from '@/lib/api/adapters';
import { t, tf } from '@/lib/i18n';

type CategoryScoreView = ReturnType<typeof adaptCategoryScoresNullable>[number];

interface StrengthsPanelProps {
  severityCounts: Record<Severity, number>;
  categoryScores: readonly CategoryScoreView[];
}

interface StrengthItem {
  id: string;
  // Single short headline ("Critical 취약점 0건") rendered as the card body.
  headline: string;
  // Optional supplemental text ("출시 결정의 가장 큰 부담을 덜었어요"); shown
  // muted under the headline. Kept short so the card stays scannable.
  supplement?: string;
}

const HIGH_SCORE_THRESHOLD = 80;

function buildStrengths({
  severityCounts,
  categoryScores,
}: StrengthsPanelProps): StrengthItem[] {
  const items: StrengthItem[] = [];

  if ((severityCounts.P0 ?? 0) === 0) {
    items.push({
      id: 'severity-p0-zero',
      headline: t('dashboard.strengths.severity.p0Zero'),
      supplement: t('dashboard.strengths.severity.p0Zero.supplement'),
    });
  }
  if ((severityCounts.P1 ?? 0) === 0) {
    items.push({
      id: 'severity-p1-zero',
      headline: t('dashboard.strengths.severity.p1Zero'),
      supplement: t('dashboard.strengths.severity.p1Zero.supplement'),
    });
  }

  for (const cat of categoryScores) {
    if (cat.score === null) continue;
    if (cat.score < HIGH_SCORE_THRESHOLD) continue;
    items.push({
      id: `category-${cat.category}`,
      headline: tf('dashboard.strengths.category.high', {
        label: cat.label,
        score: cat.score,
      }),
    });
  }

  return items;
}

export function StrengthsPanel(props: StrengthsPanelProps) {
  const items = buildStrengths(props);

  if (items.length === 0) {
    return null;
  }

  return (
    <section
      data-testid="strengths-panel"
      aria-labelledby="strengths-title"
      className="flex flex-col gap-3"
    >
      <h2
        id="strengths-title"
        className="text-sm font-medium uppercase tracking-wide text-[color:var(--color-fg-muted)]"
      >
        {t('dashboard.strengths.title')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Card
            key={item.id}
            variant="default"
            padding="md"
            data-testid={`strength-card-${item.id}`}
          >
            <CardBody>
              <div className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="text-base leading-none text-[color:var(--color-severity-p3)]"
                >
                  ✅
                </span>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-[color:var(--color-fg-primary)]">
                    {item.headline}
                  </span>
                  {item.supplement ? (
                    <span className="text-xs text-[color:var(--color-fg-muted)]">
                      {item.supplement}
                    </span>
                  ) : null}
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </section>
  );
}
