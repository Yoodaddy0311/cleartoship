import { Card, CardBody } from '@cleartoship/ui';
import { DashboardTabs } from '@/app/audits/[id]/dashboard/page';
import { MarkdownViewer } from '@/components/report/markdown-viewer';
import { DownloadMarkdownButton } from '@/components/report/download-button';
import { getMockAudit } from '@/lib/mock/audit-fixture';
import { t } from '@/lib/i18n';

export default function ReportPage({
  params,
}: {
  params: { id: string };
}) {
  const audit = getMockAudit(params.id);
  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={audit.id} active="report" />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display-sm font-semibold text-[color:var(--color-fg-primary)]">
          {t('report.title')}
        </h1>
        <DownloadMarkdownButton
          filename={`audit-report-${audit.id}.md`}
          markdown={audit.reportMarkdown}
          label={t('report.download')}
        />
      </header>
      <Card variant="glass" padding="lg">
        <CardBody>
          <MarkdownViewer markdown={audit.reportMarkdown} />
        </CardBody>
      </Card>
    </section>
  );
}
