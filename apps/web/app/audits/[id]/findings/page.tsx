import { FindingsTable } from '@/components/findings/findings-table';
import { DashboardTabs } from '@/app/audits/[id]/dashboard/page';
import { getMockAudit } from '@/lib/mock/audit-fixture';
import { t } from '@/lib/i18n';

export default function FindingsPage({
  params,
}: {
  params: { id: string };
}) {
  const audit = getMockAudit(params.id);
  return (
    <section className="mx-auto flex w-full max-w-[1536px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={audit.id} active="findings" />
      <h1 className="text-display-sm font-semibold text-[color:var(--color-fg-primary)]">
        {t('findings.title')}
      </h1>
      <FindingsTable auditId={audit.id} findings={audit.findings} />
    </section>
  );
}
