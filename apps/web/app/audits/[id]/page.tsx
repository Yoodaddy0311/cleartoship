'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, CardTitle, Progress, Button } from '@cleartoship/ui';
import {
  ProgressTimeline,
  type AuditStep,
} from '@/components/audit-progress/progress-timeline';
import { useAuditRunPolling } from '@/components/audit-progress/use-audit-run-polling';
import { t } from '@/lib/i18n';

interface PageProps {
  params: { id: string };
}

export default function AuditProgressPage({ params }: PageProps) {
  const router = useRouter();
  const { data, loading } = useAuditRunPolling(params.id);

  useEffect(() => {
    if (data?.status === 'COMPLETED') {
      // Small delay so users perceive completion (Peak-End rule).
      const tm = setTimeout(() => {
        router.push(`/audits/${params.id}/dashboard`);
      }, 600);
      return () => clearTimeout(tm);
    }
    return undefined;
  }, [data?.status, params.id, router]);

  const currentStep = (data?.currentStep as AuditStep) ?? null;
  const progress = data?.progress ?? 0;
  const status = data?.status ?? 'PENDING';

  return (
    <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display-md font-semibold text-[color:var(--color-fg-primary)]">
          {t('progress.title')}
        </h1>
        <p className="text-md text-[color:var(--color-fg-secondary)]">
          {t('progress.subtitle')}
        </p>
        <div className="mt-4">
          <Progress
            value={progress}
            indeterminate={loading && progress === 0}
            label={`${progress}% · ${
              status === 'RUNNING' || status === 'PENDING'
                ? '진행 중'
                : status === 'COMPLETED'
                ? '완료'
                : status === 'FAILED'
                ? '실패'
                : '취소됨'
            }`}
            showValue
          />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card variant="glass" padding="md" aria-live="polite">
          <CardHeader>
            <CardTitle>15단계 분석</CardTitle>
          </CardHeader>
          <CardBody>
            <ProgressTimeline currentStep={currentStep} status={status} />
          </CardBody>
        </Card>

        <Card variant="glass" padding="md" className="min-h-[420px]">
          <CardHeader>
            <CardTitle>실시간 분석 결과</CardTitle>
          </CardHeader>
          <CardBody>
            {status === 'FAILED' ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-md text-[color:var(--color-severity-p0)]">
                  {t('progress.error.title')}
                </p>
                {data?.errorMessage ? (
                  <pre className="max-w-full overflow-auto text-xs">
                    {data.errorMessage}
                  </pre>
                ) : null}
                <Button onClick={() => router.refresh()} variant="secondary">
                  {t('progress.error.retry')}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-[color:var(--color-fg-muted)]">
                Finding이 도착하는 대로 여기에 표시됩니다.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </section>
  );
}
