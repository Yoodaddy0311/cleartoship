import Link from 'next/link';
import { Card, CardBody, Skeleton } from '@cleartoship/ui';
import type { AuditResourceState } from '@/lib/api/use-audit-resource';

interface ResourceStatePanelProps {
  state: Exclude<AuditResourceState<unknown>, { status: 'ready' }>;
  auditId: string;
  /** Optional override label for the still-processing state. */
  pendingLabel?: string;
}

/**
 * Generic loading / pending / error UI used by audit detail pages. Pages
 * render their own success branch and delegate every other state here so
 * messaging stays consistent.
 */
export function ResourceStatePanel({
  state,
  auditId,
  pendingLabel,
}: ResourceStatePanelProps) {
  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton size="h-9 w-64" />
        <Skeleton size="h-[280px] w-full" rounded="lg" />
      </div>
    );
  }

  if (state.status === 'pending') {
    return (
      <Card variant="default" padding="md">
        <CardBody>
          <h2 className="text-lg font-medium text-[color:var(--color-fg-primary)]">
            {pendingLabel ?? '분석이 아직 진행 중입니다.'}
          </h2>
          <p className="mt-2 text-sm text-[color:var(--color-fg-secondary)]">
            완료되면 결과가 자동으로 표시됩니다. 진행 상황은{' '}
            <Link
              href={`/audits/${auditId}`}
              className="underline-offset-2 hover:underline"
            >
              진행 화면
            </Link>
            에서 확인할 수 있습니다.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (state.status === 'unauthorized') {
    return (
      <Card variant="default" padding="md">
        <CardBody>
          <h2 className="text-lg font-medium text-[color:var(--color-fg-primary)]">
            로그인이 필요합니다.
          </h2>
          <p className="mt-2 text-sm text-[color:var(--color-fg-secondary)]">
            이 감사 결과는 소유자만 열람할 수 있습니다.{' '}
            <Link href="/login" className="underline-offset-2 hover:underline">
              로그인
            </Link>
            한 뒤 다시 시도해 주세요.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (state.status === 'not-found') {
    return (
      <Card variant="default" padding="md">
        <CardBody>
          <h2 className="text-lg font-medium text-[color:var(--color-fg-primary)]">
            해당 감사 결과를 찾을 수 없습니다.
          </h2>
          <p className="mt-2 text-sm text-[color:var(--color-fg-secondary)]">
            ID가 올바른지 확인하거나{' '}
            <Link href="/audits/new" className="underline-offset-2 hover:underline">
              새 감사를 시작
            </Link>
            해 주세요.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (state.status === 'failed') {
    return (
      <Card variant="default" padding="md">
        <CardBody>
          <h2 className="text-lg font-medium text-[color:var(--color-severity-p0)]">
            감사가 {state.runStatus === 'CANCELLED' ? '취소' : '실패'}되었습니다.
          </h2>
          {state.message ? (
            <pre className="mt-2 max-w-full overflow-auto text-xs text-[color:var(--color-fg-muted)]">
              {state.message}
            </pre>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card variant="default" padding="md">
      <CardBody>
        <h2 className="text-lg font-medium text-[color:var(--color-severity-p0)]">
          데이터를 불러오는 중 오류가 발생했습니다.
        </h2>
        <p className="mt-2 text-sm text-[color:var(--color-fg-secondary)]">
          {state.message}
        </p>
      </CardBody>
    </Card>
  );
}
