'use client';

import { Card, CardBody } from '@cleartoship/ui';
import { DashboardTabs } from '@/app/audits/[id]/dashboard/page';
import { MarkdownViewer } from '@/components/report/markdown-viewer';
import { DownloadMarkdownButton } from '@/components/report/download-button';
import { ResourceStatePanel } from '@/components/common/resource-state-panel';
import { getReport } from '@/lib/api/audit-runs';
import { useAuditResource } from '@/lib/api/use-audit-resource';
import { t } from '@/lib/i18n';
import type { AuditReport } from '@/lib/api/audit-runs';

export default function ReportPage({
  params,
}: {
  params: { id: string };
}) {
  const auditId = params.id;
  const state = useAuditResource<AuditReport>(
    () => getReport(auditId),
    [auditId]
  );

  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={auditId} active="report" />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display-sm font-semibold text-[color:var(--color-fg-primary)]">
          {t('report.title')}
        </h1>
        {state.status === 'ready' ? (
          <DownloadMarkdownButton
            filename={`audit-report-${auditId}.md`}
            markdown={state.data.markdown}
            label={t('report.download')}
          />
        ) : null}
      </header>
      {state.status === 'ready' ? (
        <Card variant="default" padding="lg">
          <CardBody>
            <MarkdownViewer markdown={state.data.markdown} />
          </CardBody>
        </Card>
      ) : (
        <ResourceStatePanel
          state={state}
          auditId={auditId}
          pendingLabel="리포트가 아직 생성되지 않았습니다."
        />
      )}
    </section>
  );
}
