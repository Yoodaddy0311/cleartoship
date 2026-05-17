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

/**
 * T2.12 #112: Categories that go N/A when a given tool is missing. Used by
 * the banner to surface "보안 검사 (실행되지 않음)" labels instead of dumping
 * raw tool names. Single source of truth so future tools only need one entry
 * here. Categories use the canonical UPPER_SNAKE keys from
 * `shared-types` `AuditCategory`, mapped to UI strings via i18n.
 */
const TOOL_TO_CATEGORIES: Record<string, readonly string[]> = {
  semgrep: ['FRONTEND_CODE', 'SECURITY_PRIVACY'],
  'osv-scanner': ['SECURITY_PRIVACY'],
  gitleaks: ['SECURITY_PRIVACY'],
  lighthouse: ['LAUNCH_READINESS', 'UX_UI'],
  'lighthouse-axe': ['LAUNCH_READINESS', 'UX_UI'],
};

/** Why each category went N/A. Stored on the affected category cell so the
 * banner can distinguish ops-env skipping (FAILED) from guardrail short-circuit
 * (BLOCKED). The user-facing copy lives in i18n. */
type NaReason = 'skipped' | 'blocked' | 'failed';

interface BlockedContext {
  /** Machine code from `AuditRun.abortReason` (e.g. `REPO_TOO_LARGE`). */
  abortReason: string;
}

interface PartialResultBannerProps {
  /**
   * Names of analysis tools that returned `ToolResult.status === 'SKIPPED'`
   * during this audit run (typically because the binary was absent on the
   * worker host, or — for lighthouse — the user did not supply a deploy URL).
   * Empty array → renders nothing (unless `blockedContext` is supplied).
   */
  toolNames: readonly string[];
  /**
   * T2.12 #112: when present, the banner switches to "BLOCKED (guardrail)"
   * mode. The affected categories are still derived from `toolNames`, but the
   * N/A reason chip flips from "실행되지 않음" → "가드레일 작동으로 중단"
   * and a top note shows the abortReason. Optional so the existing call sites
   * keep their behaviour unchanged.
   */
  blockedContext?: BlockedContext;
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
 * T2.12 #112: derive the de-duplicated set of N/A categories from the
 * SKIPPED tool list. Unknown tools (no entry in `TOOL_TO_CATEGORIES`) are
 * silently ignored — they will still surface in the per-tool details list
 * via {@link describeTool}, so the user is not left in the dark.
 *
 * The output preserves a stable order driven by the iteration order of
 * `TOOL_TO_CATEGORIES` values so the banner reads consistently between
 * runs ("보안 검사, 코드 품질 검사, 성능 검사").
 */
function categoriesFromTools(toolNames: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of toolNames) {
    const cats = TOOL_TO_CATEGORIES[name];
    if (!cats) continue;
    for (const c of cats) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/** Localised label for an audit category, using the dedicated
 * `errors.audit.category.<KEY>` key. Falls back to the raw key when missing
 * (defensive — every entry in `TOOL_TO_CATEGORIES` should have a string). */
function categoryLabel(category: string): string {
  const key = `errors.audit.category.${category}` as Parameters<typeof t>[0];
  return t(key);
}

function naReasonLabel(reason: NaReason): string {
  if (reason === 'blocked') {
    return t('errors.audit.toolUnavailable.naReason.blocked');
  }
  if (reason === 'failed') {
    return t('errors.audit.toolUnavailable.naReason.failed');
  }
  return t('errors.audit.toolUnavailable.naReason.skipped');
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
  blockedContext,
  className,
}: PartialResultBannerProps) {
  if (toolNames.length === 0 && blockedContext === undefined) {
    return null;
  }

  const described = toolNames.map(describeTool);
  const hasDeployUrlGap = described.some((d) => d.requiresDeployUrl);
  const naCategories = categoriesFromTools(toolNames);
  // T2.12 #112: BLOCKED (guardrail) vs FAILED (도구 오류) 구분 — when the
  // caller knows the run was aborted by a guardrail, every affected category
  // is labelled as "가드레일 작동으로 중단" instead of "실행되지 않음".
  const naReason: NaReason = blockedContext !== undefined ? 'blocked' : 'skipped';

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="partial-result-banner"
      data-na-reason={naReason}
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
          {toolNames.length === 0 && blockedContext !== undefined
            ? t('errors.audit.toolUnavailable.categoryHeading')
            : tf('errors.audit.toolUnavailable.summary', {
                count: toolNames.length,
              })}
        </span>
      </div>

      {blockedContext !== undefined ? (
        <p
          data-testid="partial-result-blocked-note"
          className="ml-6 text-[color:var(--color-fg-secondary)]"
        >
          {tf('errors.audit.toolUnavailable.blockedNote', {
            abortReason: blockedContext.abortReason,
          })}
        </p>
      ) : null}

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

      {naCategories.length > 0 ? (
        <section
          data-testid="partial-result-categories"
          aria-label={t('errors.audit.toolUnavailable.categoryHeading')}
          className="ml-6"
        >
          <p className="font-medium text-[color:var(--color-fg-primary)]">
            {t('errors.audit.toolUnavailable.categoryHeading')}
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {naCategories.map((cat) => {
              const descId = `na-cat-desc-${cat}`;
              return (
                <li
                  key={cat}
                  data-testid={`partial-result-category-${cat}`}
                  data-na-reason={naReason}
                  aria-describedby={descId}
                  title={t('errors.audit.toolUnavailable.whyNa')}
                  className="inline-flex items-center gap-1 rounded border border-[color:var(--color-severity-p2)] bg-[rgba(245,158,11,0.12)] px-2 py-0.5 text-xs text-[color:var(--color-fg-primary)]"
                >
                  <span aria-hidden="true">⚠️</span>
                  <span>
                    {categoryLabel(cat)}{' '}
                    <span className="text-[color:var(--color-fg-muted)]">
                      ({naReasonLabel(naReason)})
                    </span>
                  </span>
                  <span id={descId} className="sr-only">
                    {t('errors.audit.toolUnavailable.whyNa')}{' '}
                    {naReasonLabel(naReason)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {described.length > 0 ? (
        <details className="ml-6">
          <summary className="cursor-pointer text-[color:var(--color-fg-secondary)] hover:text-[color:var(--color-fg-primary)]">
            {t('errors.audit.toolUnavailable.whyNa')}
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
      ) : null}
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
