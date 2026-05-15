import { DashboardTabs } from '@/app/audits/[id]/dashboard/page';
import { CopyPromptButton } from '@/components/improvement-prd/copy-prompt-button';
import { PrdViewer } from '@/components/improvement-prd/prd-viewer';
import { DownloadMarkdownButton } from '@/components/report/download-button';
import { getMockAudit } from '@/lib/mock/audit-fixture';
import { t } from '@/lib/i18n';

export default function ImprovementPrdPage({
  params,
}: {
  params: { id: string };
}) {
  const audit = getMockAudit(params.id);
  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={audit.id} active="improvement-prd" />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display-sm font-semibold text-[color:var(--color-fg-primary)]">
          {t('prd.title')}
        </h1>
        <div className="flex flex-wrap gap-2">
          <CopyPromptButton markdown={audit.improvementPrdMarkdown} />
          <DownloadMarkdownButton
            filename={`improvement-prd-${audit.id}.md`}
            markdown={audit.improvementPrdMarkdown}
            label={t('prd.download')}
          />
        </div>
      </header>
      <PrdViewer markdown={audit.improvementPrdMarkdown} />
    </section>
  );
}
