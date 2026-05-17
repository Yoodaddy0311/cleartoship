import { Card, CardBody, ScoreRing } from '@cleartoship/ui';
import { LaunchStatusChip } from '@/components/common/launch-status-chip';
import { launchStatusLabel, type LaunchStatus } from '@/lib/format/status';
import { t } from '@/lib/i18n';

export function ScoreOverview({
  score,
  launchStatus,
  summary,
}: {
  score: number;
  launchStatus: LaunchStatus;
  summary: string;
}) {
  const isIndeterminate = launchStatus === 'indeterminate';
  return (
    <Card variant="default" padding="lg">
      <CardBody>
        {isIndeterminate ? (
          <div
            data-testid="score-indeterminate-banner"
            role="status"
            className="mb-4 flex flex-col gap-1 rounded-mk border border-app-border bg-mk-bg-soft px-4 py-3"
          >
            <span className="text-sm font-medium text-[color:var(--color-fg-primary)]">
              분석 표면 부족 — 신뢰할 수 있는 점수 산정 어려움
            </span>
            <span className="text-xs text-[color:var(--color-fg-muted)]">
              일부 분석 도구가 충분한 신호를 확보하지 못해 카테고리별 점수와 출시 준비도를
              확정할 수 없습니다. 도구 설치 상태/배포 URL/PRD 입력을 보강한 뒤 다시 분석을
              실행해 주세요.
            </span>
          </div>
        ) : null}
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
          {isIndeterminate ? (
            <div
              data-testid="score-indeterminate-ring"
              role="img"
              aria-label="출시 준비도 판단 불가"
              className="flex h-[120px] w-[120px] shrink-0 items-center justify-center rounded-full border border-dashed border-[color:var(--color-border-default)] text-[color:var(--color-fg-muted)]"
            >
              <span className="font-mono text-2xl tabular-nums">N/A</span>
            </div>
          ) : (
            <ScoreRing
              score={score}
              ariaLabel={`출시 준비도 ${score}점`}
            />
          )}
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-col items-start gap-2">
              <span className="text-sm text-[color:var(--color-fg-muted)]">
                {t('dashboard.score.label')}
              </span>
              <LaunchStatusChip status={launchStatus} />
              <span className="sr-only">
                상태: {launchStatusLabel(launchStatus)}
              </span>
            </div>
            <p className="text-md leading-[1.55] text-[color:var(--color-fg-secondary)]">
              {summary}
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
