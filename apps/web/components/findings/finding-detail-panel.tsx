import { Card, CardBody, CardHeader, CardTitle, Badge } from '@cleartoship/ui';
import { SeverityChip } from '@/components/common/severity-chip';
import { EvidenceList } from '@/components/evidences/evidence-list';
import { categoryLabel } from '@/lib/format/category';
import { t } from '@/lib/i18n';
import type { MockFinding } from '@/lib/mock/audit-fixture';

export function FindingDetailPanel({ finding }: { finding: MockFinding }) {
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

      <Card variant="glass" padding="md">
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
                  className="mt-1 h-3.5 w-3.5 accent-[color:var(--color-aurora-violet)]"
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
          <EvidenceList items={finding.evidences} />
        </CardBody>
      </Card>
    </article>
  );
}
