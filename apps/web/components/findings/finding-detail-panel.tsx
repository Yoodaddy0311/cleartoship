'use client';

import { useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle, Badge, cn } from '@cleartoship/ui';
import { SeverityChip } from '@/components/common/severity-chip';
import { ConfidenceChip } from '@/components/common/confidence-chip';
import { EvidencePanel } from '@/components/evidences/evidence-panel';
import { FalsePositiveToggle } from '@/components/findings/false-positive-toggle';
import { ActionHintCell } from '@/components/findings/action-hint-cell';
import { useFalsePositive } from '@/lib/feedback/use-false-positive';
import { categoryLabel } from '@/lib/format/category';
import { explainFinding, extractSemgrepRuleId } from '@/lib/format/finding-explainer';
import { t } from '@/lib/i18n';
import type { FindingViewModel } from '@/lib/types/finding-view';

interface FindingDetailPanelProps {
  finding: FindingViewModel;
  /**
   * Server-side flag — true when the evidences array was capped (see
   * EVIDENCE_CAP). We surface a warning banner just above the evidence list
   * so users understand the list is partial. Optional/defaults to false so
   * call sites that pre-date the API field continue to work.
   */
  truncated?: boolean;
  /**
   * Audit run id, required to persist false-positive feedback under
   * `auditRuns/{auditId}/feedback/{findingId}`. Optional so existing call
   * sites that pre-date the feedback feature keep rendering — the toggle is
   * simply hidden when omitted.
   */
  auditId?: string;
  /**
   * Override the false-positive hook for tests / storybook. The component
   * default is the real Firestore-backed `useFalsePositive`.
   */
  useFalsePositiveHook?: typeof useFalsePositive;
}

export function FindingDetailPanel({
  finding,
  truncated = false,
  auditId,
  useFalsePositiveHook,
}: FindingDetailPanelProps) {
  // Subscribe to the persisted flag at the panel level so the title +
  // summary can adopt the muted/strikethrough treatment in lockstep with the
  // toggle. We pass the hook reference down to the toggle so the two views
  // share one source of truth (one Firestore read per mount, not two).
  const useHook = useFalsePositiveHook ?? useFalsePositive;
  const fp = useHook(auditId ?? '', finding.id);
  const isFalsePositive = Boolean(auditId) && fp.isFalsePositive;
  // Semgrep finding 만 rule_id 기반 한국어 풀이를 끼워 넣는다. 다른 어댑터에서
  // 만든 finding (수동 입력, 다른 정적 분석 도구 등) 은 기존 동작을 그대로
  // 유지해 회귀를 막는다. 06-static-analysis.ts:39 가 `"Semgrep: <rule>"` 형태로
  // title 을 emit 한다는 계약에 묶여 있다.
  const semgrepRuleId = extractSemgrepRuleId(finding.title);
  const friendly = semgrepRuleId
    ? explainFinding(semgrepRuleId, {
        title: finding.title,
        summary: finding.summary,
      })
    : null;

  const [showDetail, setShowDetail] = useState(false);

  // Strikethrough + muted treatment when the finding is flagged as a false
  // positive. The data-state attribute is exposed for downstream styling
  // hooks (PRD export, CSS-only print stylesheet, etc.).
  const fpStateAttr = isFalsePositive ? 'false-positive' : 'active';
  const mutedTitleClass = isFalsePositive
    ? 'line-through text-[color:var(--color-fg-muted)]'
    : 'text-[color:var(--color-fg-primary)]';
  const mutedSummaryClass = isFalsePositive
    ? 'line-through text-[color:var(--color-fg-muted)]'
    : 'text-[color:var(--color-fg-secondary)]';

  return (
    <article
      className="flex flex-col gap-6"
      data-state={fpStateAttr}
      data-testid="finding-detail-panel"
    >
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={finding.severity} />
          <Badge variant="neutral">{categoryLabel(finding.category)}</Badge>
          <ConfidenceChip confidence={finding.confidence} />
        </div>
        <h1
          className={cn(
            'ko-text text-2xl font-semibold leading-tight sm:text-display-sm',
            mutedTitleClass,
          )}
        >
          {finding.title}
        </h1>
        <p className={cn('ko-text text-md', mutedSummaryClass)}>{finding.summary}</p>
        {auditId ? (
          <FalsePositiveToggle
            isFalsePositive={fp.isFalsePositive}
            loading={fp.loading}
            saving={fp.saving}
            error={fp.error}
            onToggle={fp.toggle}
          />
        ) : null}
      </header>

      {finding.actionHint ? (
        <Card variant="default" padding="md">
          <CardHeader>
            <CardTitle>{t('findings.actionHint.title')}</CardTitle>
          </CardHeader>
          <CardBody>
            <ActionHintCell hint={finding.actionHint} variant="panel" />
          </CardBody>
        </Card>
      ) : null}

      <Card variant="default" padding="md">
        <CardHeader>
          <CardTitle>{t('findings.detail.nonDeveloper')}</CardTitle>
        </CardHeader>
        <CardBody>
          {friendly ? (
            <div
              data-testid="friendly-explanation"
              className="flex flex-col gap-3 leading-[1.6] ko-text text-[color:var(--color-fg-primary)]"
            >
              <p>
                <span className="font-semibold">무엇이 문제인가요? </span>
                {friendly.what}
              </p>
              <p>
                <span className="font-semibold">왜 위험한가요? </span>
                {friendly.why}
              </p>
              {showDetail ? (
                <>
                  {friendly.analogy ? (
                    <p data-testid="friendly-analogy">
                      <span className="font-semibold">비유: </span>
                      {friendly.analogy}
                    </p>
                  ) : null}
                  <p data-testid="friendly-fix-guide">
                    <span className="font-semibold">어떻게 고치나요? </span>
                    {friendly.fixGuide}
                  </p>
                </>
              ) : null}
              <button
                type="button"
                aria-expanded={showDetail}
                onClick={() => setShowDetail((s) => !s)}
                className="self-start text-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                {showDetail ? '간단히 보기' : '자세히 보기'}
              </button>
            </div>
          ) : (
            <p className="leading-[1.6] ko-text text-[color:var(--color-fg-primary)]">
              {finding.nonDeveloperExplanation}
            </p>
          )}
        </CardBody>
      </Card>

      <Card variant="default" padding="md">
        <CardHeader>
          <CardTitle>{t('findings.detail.technical')}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="leading-[1.6] ko-text text-[color:var(--color-fg-secondary)]">
            {finding.technicalExplanation}
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card variant="default" padding="md">
          <CardHeader>
            <CardTitle>{t('findings.detail.impact')}</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-[1.6] ko-text text-[color:var(--color-fg-secondary)]">
              {(finding.impact ?? []).map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card variant="default" padding="md">
          <CardHeader>
            <CardTitle>{t('findings.detail.recommendation')}</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="list-decimal space-y-1 pl-5 text-sm leading-[1.6] ko-text text-[color:var(--color-fg-secondary)]">
              {(finding.recommendation ?? []).map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>

      <Card variant="default" padding="md">
        <CardHeader>
          <CardTitle>{t('findings.detail.acceptance')}</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="space-y-1.5 text-sm text-[color:var(--color-fg-secondary)]">
            {finding.acceptanceCriteria.map((it, i) => (
              <li key={i} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  disabled
                  aria-label={`수용 기준 ${i + 1}`}
                  className="mt-1 h-3.5 w-3.5 accent-[color:var(--mk-accent-2)]"
                />
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card variant="default" padding="md">
        <CardBody>
          {/* L-P1-4: EvidencePanel owns the collapse trigger + persistence,
              the truncated banner, and the list render. ruleId prefers the
              semgrep rule_id (stable across audits of the same repo) and
              falls back to a finding-scoped key so collapse state still
              persists per-finding for non-semgrep adapters. */}
          <EvidencePanel
            ruleId={semgrepRuleId ?? `finding-${finding.id}`}
            items={finding.evidences}
            truncated={truncated}
          />
        </CardBody>
      </Card>
    </article>
  );
}
