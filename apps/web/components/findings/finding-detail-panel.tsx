import { AlertTriangle } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle, Badge, cn } from '@cleartoship/ui';
import { SeverityChip } from '@/components/common/severity-chip';
import { EvidenceList } from '@/components/evidences/evidence-list';
import { categoryLabel } from '@/lib/format/category';
import { t } from '@/lib/i18n';
import type { MockFinding } from '@/lib/mock/audit-fixture';

interface FindingDetailPanelProps {
  finding: MockFinding;
  /**
   * Server-side flag — true when the evidences array was capped (see
   * EVIDENCE_CAP). We surface a warning banner just above the evidence list
   * so users understand the list is partial. Optional/defaults to false so
   * call sites that pre-date the API field continue to work.
   */
  truncated?: boolean;
}

export function FindingDetailPanel({
  finding,
  truncated = false,
}: FindingDetailPanelProps) {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={finding.severity} />
          <Badge variant="neutral">{categoryLabel(finding.category)}</Badge>
          <Badge variant="neutral">신뢰도 {finding.confidence}</Badge>
        </div>
        <h1 className="text-display-sm font-semibold text-[color:var(--color-fg-primary)]">
          {finding.title}
        </h1>
        <p className="text-md text-[color:var(--color-fg-secondary)]">{finding.summary}</p>
      </header>

      <Card variant="default" padding="md">
        <CardHeader>
          <CardTitle>{t('findings.detail.nonDeveloper')}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="leading-[1.55] text-[color:var(--color-fg-primary)]">
            {finding.nonDeveloperExplanation}
          </p>
        </CardBody>
      </Card>

      <Card variant="default" padding="md">
        <CardHeader>
          <CardTitle>{t('findings.detail.technical')}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="leading-[1.55] text-[color:var(--color-fg-secondary)]">
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
            <ul className="list-disc space-y-1 pl-5 text-sm leading-[1.55] text-[color:var(--color-fg-secondary)]">
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
            <ol className="list-decimal space-y-1 pl-5 text-sm leading-[1.55] text-[color:var(--color-fg-secondary)]">
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
        <CardHeader>
          <CardTitle>{t('findings.detail.evidences')}</CardTitle>
        </CardHeader>
        <CardBody>
          {truncated ? (
            <div
              role="status"
              aria-live="polite"
              data-testid="evidence-truncated-banner"
              className={cn(
                'mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
                'border-[color:var(--color-severity-p2)]',
                'bg-[rgba(245,158,11,0.08)]',
                'text-[color:var(--color-fg-primary)]'
              )}
            >
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-severity-p2)]"
              />
              <span>
                <span className="font-medium text-[color:var(--color-severity-p2)]">
                  알림:
                </span>{' '}
                <span className="text-[color:var(--color-fg-secondary)]">
                  {t('findings.detail.evidences.truncated')}
                </span>
              </span>
            </div>
          ) : null}
          <EvidenceList items={finding.evidences} />
        </CardBody>
      </Card>
    </article>
  );
}
