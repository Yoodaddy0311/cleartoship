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
//   3. categoryScores: every category with score >= 80 (and not null/N/A).
//      Label resolution: `errors.audit.category.<KEY>` from the existing i18n
//      namespace, falling back to the raw key if a category lacks a label.
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
import { t, tf, type I18nKey } from '@/lib/i18n';

// `adaptCategoryScoresNullable` returns Record<AuditCategory, number | null>
// (one entry per UI-visible category, score=null when unscored).
type CategoryScoresMap = ReturnType<typeof adaptCategoryScoresNullable>;
type CategoryKey = keyof CategoryScoresMap;

/**
 * PR-A4-fix — surfaceable inventory signals. The scoring step does NOT use
 * these to assign points (that would conflate existence with quality). The
 * strengths panel renders each true signal as a positive "권장사항: 발견된
 * 신호" card so the user sees the source-driven data even though the
 * matching category remains N/A until Phase B (LLM) judges quality.
 */
export interface InventorySignalsView {
  repoMetadata: boolean;
  dataModel: boolean;
  routes: boolean;
}

interface StrengthsPanelProps {
  severityCounts: Record<Severity, number>;
  categoryScores: CategoryScoresMap;
  /**
   * Optional — when omitted (old persisted reports, fixtures) we render
   * only the legacy severity + high-score cards. New runs ship this from
   * `report.inventorySignals`.
   */
  inventorySignals?: InventorySignalsView;
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

/**
 * Resolve a category key to its human-readable label via the same i18n
 * namespace `PartialResultBanner.categoryLabel` uses, so the strength card
 * reads "보안 검사 우수 (90점)" consistent with the rest of the dashboard.
 * Falls back to the raw key for categories whose i18n entry is missing
 * (defensive — UI-visible categories should all have labels).
 */
function categoryLabel(category: CategoryKey): string {
  const key = `errors.audit.category.${category}` as I18nKey;
  const label = t(key);
  // i18n returns the key itself when missing; treat that as "no label" and
  // surface the raw category as a last-resort identifier.
  return label === key ? String(category) : label;
}

function buildStrengths({
  severityCounts,
  categoryScores,
  inventorySignals,
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

  const categoryEntries = Object.entries(categoryScores) as [
    CategoryKey,
    number | null,
  ][];
  for (const [category, score] of categoryEntries) {
    if (score === null) continue;
    if (score < HIGH_SCORE_THRESHOLD) continue;
    items.push({
      id: `category-${category}`,
      headline: tf('dashboard.strengths.category.high', {
        label: categoryLabel(category),
        score,
      }),
    });
  }

  // PR-A4-fix — surface inventory signals as positive cards. These do NOT
  // contribute to the score (the score for the matching category is still
  // N/A); they're framed as 권장사항 / 발견된 신호 so the user understands
  // the source-driven data was found but the quality verdict awaits the
  // LLM (Phase B) or the missing tool (Phase 1).
  if (inventorySignals?.repoMetadata) {
    items.push({
      id: 'inventory-repoMetadata',
      headline: t('dashboard.strengths.inventory.repoMetadata'),
      supplement: t('dashboard.strengths.inventory.repoMetadata.supplement'),
    });
  }
  if (inventorySignals?.routes) {
    items.push({
      id: 'inventory-routes',
      headline: t('dashboard.strengths.inventory.routes'),
      supplement: t('dashboard.strengths.inventory.routes.supplement'),
    });
  }
  if (inventorySignals?.dataModel) {
    items.push({
      id: 'inventory-dataModel',
      headline: t('dashboard.strengths.inventory.dataModel'),
      supplement: t('dashboard.strengths.inventory.dataModel.supplement'),
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
