import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Card, CardBody, Skeleton, cn } from '@cleartoship/ui';
import type { AuditResourceState } from '@/lib/api/use-audit-resource';
import { t, tf } from '@/lib/i18n';

/**
 * Reason codes for the empty/pending fallback used by audit detail pages.
 * Pages pass the most specific reason they can infer; the panel renders a
 * non-developer-friendly explanation and next-action guidance accordingly.
 */
export type ResourceEmptyReason =
  | 'unsupported-framework'
  | 'no-deploy-url'
  | 'pipeline-not-reached'
  | 'unknown';

export interface ResourceEmptyContext {
  reason: ResourceEmptyReason;
  /** Only used when reason === 'unsupported-framework'. */
  detectedFramework?: string;
}

interface ResourceStatePanelProps {
  state: Exclude<AuditResourceState<unknown>, { status: 'ready' }>;
  auditId: string;
  /** Optional override label for the still-processing state. */
  pendingLabel?: string;
  /**
   * Optional structured context for the pending/empty branch. When provided,
   * the panel renders a reason-specific friendly explanation plus a "next
   * actions" list. When omitted, falls back to the generic pending message
   * so existing call sites keep their previous behaviour.
   */
  emptyContext?: ResourceEmptyContext;
}

interface PartialResultBannerProps {
  /**
   * Names of analysis tools that returned `ToolResult.status === 'SKIPPED'`
   * during this audit run (typically because the binary was absent on the
   * worker host, or — for lighthouse — the user did not supply a deploy URL).
   * Empty array → renders nothing.
   */
  toolNames: readonly string[];
  className?: string;
}

/**
 * Non-developer-friendly description of each analysis tool. Used by the
 * partial-result banner to explain *what* each missing check actually does
 * and *why* it matters, instead of dumping raw tool names.
 *
 * `requiresDeployUrl: true` flips the banner copy to a "you can fix this"
 * message (add a deploy URL) rather than the generic "ops env issue" one.
 */
const TOOL_FRIENDLY_NAMES: Record<
  string,
  { name: string; analyzes: string; requiresDeployUrl?: boolean }
> = {
  semgrep: {
    name: '코드 패턴 검사',
    analyzes: '보안/품질 패턴',
  },
  'osv-scanner': {
    name: '의존성 보안 검사',
    analyzes: '오픈소스 라이브러리 취약점',
  },
  gitleaks: {
    name: '시크릿 검사',
    analyzes: '코드에 노출된 비밀번호/API 키',
  },
  lighthouse: {
    name: '성능/접근성 측정',
    analyzes: '실제 배포된 사이트의 속도와 접근성 (배포 URL 필요)',
    requiresDeployUrl: true,
  },
  'lighthouse-axe': {
    name: '성능/접근성 측정',
    analyzes: '실제 배포된 사이트 (배포 URL 미입력 시 자동 스킵)',
    requiresDeployUrl: true,
  },
};

function describeTool(name: string): {
  label: string;
  analyzes: string;
  requiresDeployUrl: boolean;
} {
  const entry = TOOL_FRIENDLY_NAMES[name];
  if (entry) {
    return {
      label: `${entry.name} (${name})`,
      analyzes: entry.analyzes,
      requiresDeployUrl: entry.requiresDeployUrl === true,
    };
  }
  return { label: name, analyzes: '분석 환경에서 실행되지 않았어요', requiresDeployUrl: false };
}

/**
 * "Partial results" warn banner used by the audit-progress and dashboard
 * pages. Surfaces missing-tool degradation that would otherwise be invisible
 * (the run completes with score 0 with no obvious cause).
 *
 * Renders a two-row layout: a one-line summary up top and a collapsible
 * `<details>` with per-tool friendly descriptions. Tools that require a
 * deploy URL (lighthouse / lighthouse-axe) get a separate, actionable hint
 * because that is a user-fixable input, not an ops environment issue.
 *
 * Marked `role="status"` (not `alert`) because the run still completed —
 * this is informational, not a failure state. Renders nothing when
 * `toolNames` is empty so consumers can mount it unconditionally.
 */
export function PartialResultBanner({
  toolNames,
  className,
}: PartialResultBannerProps) {
  if (toolNames.length === 0) {
    return null;
  }

  const described = toolNames.map(describeTool);
  const hasDeployUrlGap = described.some((d) => d.requiresDeployUrl);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="partial-result-banner"
      className={cn(
        'flex flex-col gap-2 rounded-md border px-3 py-2 text-sm',
        'border-[color:var(--color-severity-p2)]',
        'bg-[rgba(245,158,11,0.08)]',
        'text-[color:var(--color-fg-primary)]',
        className
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--color-severity-p2)]"
        />
        <span data-testid="partial-result-summary" className="font-medium">
          {tf('errors.audit.toolUnavailable.summary', { count: toolNames.length })}
        </span>
      </div>

      {hasDeployUrlGap ? (
        <p
          data-testid="partial-result-deploy-hint"
          className="ml-6 text-[color:var(--color-fg-secondary)]"
        >
          <strong>배포 URL을 입력하시면</strong>{' '}
          {t('errors.audit.toolUnavailable.deployUrlHint')} —{' '}
          <Link href="/audits/new" className="underline-offset-2 hover:underline">
            &lsquo;새 감사&rsquo; 폼
          </Link>
          에서 배포 URL 칸을 채워주세요.
        </p>
      ) : null}

      <details className="ml-6">
        <summary className="cursor-pointer text-[color:var(--color-fg-secondary)] hover:text-[color:var(--color-fg-primary)]">
          어떤 검사가 빠졌나요?
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[color:var(--color-fg-secondary)]">
          {described.map((d, idx) => (
            <li key={`${toolNames[idx]}`}>
              <span className="font-medium text-[color:var(--color-fg-primary)]">
                {d.label}
              </span>
              <span className="ml-1">— {d.analyzes}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[color:var(--color-fg-muted)]">
          {t('errors.audit.toolUnavailable.disclaimer')}
        </p>
      </details>
    </div>
  );
}

interface EmptyGuidanceProps {
  context: ResourceEmptyContext;
  auditId: string;
}

/**
 * Reason-specific friendly empty/pending body. Lives inline (not a separate
 * exported component) because every branch shares the same surrounding card
 * shell and we want one place to keep copy consistent.
 */
function EmptyGuidance({ context, auditId }: EmptyGuidanceProps) {
  if (context.reason === 'unsupported-framework') {
    return (
      <>
        <p
          data-testid="empty-context-message"
          className="mt-2 text-sm text-[color:var(--color-fg-secondary)]"
        >
          {tf('audit.empty.unsupportedFramework', {
            framework: context.detectedFramework ?? '알 수 없음',
          })}
        </p>
        <div className="mt-3 text-sm text-[color:var(--color-fg-secondary)]">
          <span className="font-medium text-[color:var(--color-fg-primary)]">
            {t('audit.empty.nextActions')}
          </span>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              지원되는 프레임워크 목록은{' '}
              <Link href="/docs" className="underline-offset-2 hover:underline">
                문서
              </Link>
              에서 확인할 수 있어요.
            </li>
            <li>부분 결과만으로도 코드 품질/보안은 충분히 점검됩니다.</li>
          </ul>
        </div>
      </>
    );
  }

  if (context.reason === 'no-deploy-url') {
    return (
      <>
        <p
          data-testid="empty-context-message"
          className="mt-2 text-sm text-[color:var(--color-fg-secondary)]"
        >
          {t('audit.empty.noDeployUrl')}
        </p>
        <div className="mt-3 text-sm text-[color:var(--color-fg-secondary)]">
          <span className="font-medium text-[color:var(--color-fg-primary)]">
            {t('audit.empty.nextActions')}
          </span>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              성능/접근성도 보고 싶다면{' '}
              <Link
                href="/audits/new"
                className="underline-offset-2 hover:underline"
              >
                새 감사를 시작
              </Link>
              하면서 배포 URL을 함께 입력해 주세요.
            </li>
            <li>
              <Link
                href={`/audits/${auditId}`}
                className="underline-offset-2 hover:underline"
              >
                진행 화면
              </Link>
              에서 다른 결과는 확인할 수 있어요.
            </li>
          </ul>
        </div>
      </>
    );
  }

  if (context.reason === 'pipeline-not-reached') {
    return (
      <>
        <p
          data-testid="empty-context-message"
          className="mt-2 text-sm text-[color:var(--color-fg-secondary)]"
        >
          {t('audit.empty.pipelineNotReached')}
        </p>
        <div className="mt-3 text-sm text-[color:var(--color-fg-secondary)]">
          <span className="font-medium text-[color:var(--color-fg-primary)]">
            {t('audit.empty.nextActions')}
          </span>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <Link
                href={`/audits/${auditId}`}
                className="underline-offset-2 hover:underline"
              >
                진행 화면
              </Link>
              에서 현재 단계를 확인할 수 있어요.
            </li>
            <li>완료되면 이 화면이 자동으로 새로고침됩니다.</li>
          </ul>
        </div>
      </>
    );
  }

  return (
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
  );
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
  emptyContext,
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
          {emptyContext ? (
            <EmptyGuidance context={emptyContext} auditId={auditId} />
          ) : (
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
          )}
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
