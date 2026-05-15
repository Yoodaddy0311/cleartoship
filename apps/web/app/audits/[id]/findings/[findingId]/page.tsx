import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { DashboardTabs } from '@/app/audits/[id]/dashboard/page';
import { FindingDetailPanel } from '@/components/findings/finding-detail-panel';
import { getMockAudit } from '@/lib/mock/audit-fixture';
import { t } from '@/lib/i18n';

interface PageProps {
  params: { id: string; findingId: string };
}

export default function FindingDetailPage({ params }: PageProps) {
  const audit = getMockAudit(params.id);
  const finding = audit.findings.find((f) => f.id === params.findingId);
  if (!finding) notFound();

  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={audit.id} active="findings" />
      <Link
        href={`/audits/${audit.id}/findings`}
        className="inline-flex items-center gap-1 text-sm text-[color:var(--color-fg-secondary)] hover:text-[color:var(--color-fg-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {t('common.back')}
      </Link>
      <FindingDetailPanel finding={finding} />
    </section>
  );
}
