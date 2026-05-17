'use client';

import { useParams } from 'next/navigation';
import { DashboardTabs } from '@/app/audits/[id]/dashboard/page';
import { CopyPromptButton } from '@/components/improvement-prd/copy-prompt-button';
import { PrdViewer } from '@/components/improvement-prd/prd-viewer';
import { DownloadMarkdownButton } from '@/components/report/download-button';
import { ResourceStatePanel } from '@/components/common/resource-state-panel';
import { getImprovementPrd } from '@/lib/api/audit-runs';
import { useAuditResource } from '@/lib/api/use-audit-resource';
import { t } from '@/lib/i18n';
import type { ImprovementPRD } from '@/lib/api/audit-runs';

export default function ImprovementPrdPage() {
  const { id: auditId } = useParams<{ id: string }>();
  const state = useAuditResource<ImprovementPRD>(
    () => getImprovementPrd(auditId),
    [auditId]
  );

  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-10 sm:px-6">
      <DashboardTabs auditId={auditId} active="improvement-prd" />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-display-sm font-semibold text-[color:var(--color-fg-primary)]">
          {t('prd.title')}
        </h1>
        {state.status === 'ready' ? (
          <div className="flex flex-wrap gap-2">
            <CopyPromptButton markdown={state.data.markdown} />
            <DownloadMarkdownButton
              filename={`improvement-prd-${auditId}.md`}
              markdown={state.data.markdown}
              label={t('prd.download')}
            />
          </div>
        ) : null}
      </header>
      {state.status === 'ready' ? (
        <PrdViewer markdown={state.data.markdown} />
      ) : (
        <ResourceStatePanel
          state={state}
          auditId={auditId}
          pendingLabel="개선 PRD가 아직 생성되지 않았습니다."
        />
      )}
    </section>
  );
}
