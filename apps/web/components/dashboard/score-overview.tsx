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
  return (
    <Card variant="default" padding="lg">
      <CardBody>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
          <ScoreRing
            score={score}
            ariaLabel={`출시 준비도 ${score}점`}
          />
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
