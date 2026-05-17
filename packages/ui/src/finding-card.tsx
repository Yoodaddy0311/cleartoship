import * as React from 'react';
import { cn } from './lib/cn';

export type FindingSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type FindingStatus = 'open' | 'confirmed' | 'dismissed';

export interface FindingCardProps {
  severity: FindingSeverity;
  title: string;
  ruleId: string;
  filePath: string;
  line: number;
  category: string;
  excerpt?: string;
  status?: FindingStatus;
  onView?: () => void;
  onConfirm?: () => void;
  onDismiss?: () => void;
  className?: string;
  // Optional label override per severity (e.g. localized wording from the
  // host app). Callers in apps/web inject `SEVERITY_LANGUAGE_KO[sev].label`
  // from audit-core; without it we fall back to the Korean defaults below
  // so this presentation package has no business-logic dependency.
  severityLabels?: Record<FindingSeverity, string>;
}

const DEFAULT_SEVERITY_LABELS: Record<FindingSeverity, string> = {
  P0: '출시 차단',
  P1: '강력 권장',
  P2: '개선 권장',
  P3: '장기 개선',
};

const severityVar: Record<FindingSeverity, string> = {
  P0: 'var(--sev-p0)',
  P1: 'var(--sev-p1)',
  P2: 'var(--sev-p2)',
  P3: 'var(--sev-p3)',
};

// T2.11 #122: 모바일에서 좁은 가로폭에 라벨 풀텍스트가 들어가지 못해
// FindingCard 헤더가 다단으로 줄바꿈되며 흔들림을 만든다. 작은 화면에서는
// severity 코드만 노출하고 풀 라벨은 sr-only + sm:inline 으로만 유지.
// (severity 자체가 "P0..P3" 이므로 별도 단축 맵 없이 그대로 사용.)

export function FindingCard({
  severity,
  title,
  ruleId,
  filePath,
  line,
  category,
  excerpt,
  status = 'open',
  onView,
  onConfirm,
  onDismiss,
  className,
  severityLabels,
}: FindingCardProps) {
  const sevColor = severityVar[severity];
  const labelMap = severityLabels ?? DEFAULT_SEVERITY_LABELS;
  const fullSeverityLabel = `${severity} · ${labelMap[severity]}`;
  const shortSeverityLabel = severity;
  return (
    <article
      data-severity={severity}
      data-status={status}
      className={cn('relative overflow-hidden', className)}
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 'var(--app-radius)',
        boxShadow: 'var(--app-shadow-card)',
        // T2.11: 모바일에서 좌측 16px 여백은 severity bar(1px) + 콘텐츠 충돌
        // 위험이 있어 좌측은 18px로만 좁히고, 좌우 비대칭을 줄여 한국어 텍스트가
        // 우측 잘림 없이 wrap 되도록 함.
        padding: '14px 16px 14px 20px',
      }}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: sevColor }}
      />

      <header className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold uppercase tracking-wide"
          style={{
            color: sevColor,
            backgroundColor: `color-mix(in oklch, ${sevColor} 14%, transparent)`,
            border: `1px solid color-mix(in oklch, ${sevColor} 28%, transparent)`,
          }}
          data-testid="finding-card-severity"
        >
          {/* T2.11: 모바일은 단축 라벨(P0..P3), sm 이상에서만 풀 라벨 노출.
              screen reader에는 항상 풀 라벨을 제공해 의미 손실 없음.
              풀 라벨은 severityLabels prop(없으면 한국어 기본값)에서 결정. */}
          <span className="sm:hidden" aria-hidden="true">
            {shortSeverityLabel}
          </span>
          <span className="hidden sm:inline" aria-hidden="true">
            {fullSeverityLabel}
          </span>
          <span className="sr-only">{fullSeverityLabel}</span>
        </span>
        <h3
          className="ko-text min-w-0 flex-1 break-words text-[15px] font-semibold"
          style={{ color: 'var(--app-fg)' }}
        >
          {title}
        </h3>
        <span
          className="ml-auto inline-flex h-5 max-w-[40vw] items-center truncate rounded px-1.5 font-mono text-[11px] sm:max-w-none"
          style={{
            color: 'var(--app-fg-muted)',
            background: 'var(--app-chip-bg)',
          }}
          title={ruleId}
        >
          {ruleId}
        </span>
      </header>

      <div
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
        style={{ color: 'var(--app-fg-muted)' }}
      >
        <span className="block max-w-full truncate font-mono">
          {filePath}:{line}
        </span>
        <span aria-hidden="true" className="hidden sm:inline">·</span>
        <span className="truncate">{category}</span>
        {excerpt ? (
          <>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            {/*
              T2.11: 한국어 excerpt가 한 줄에서 잘려 "..."로 끝나면 의미 파악이
              불가능하다. 모바일에서는 3-line clamp로 풀어 핵심 메시지가
              읽히도록 한다. 데스크탑(sm+)은 기존처럼 한 줄 truncate.
            */}
            <span className="ko-text block w-full sm:hidden mobile-line-clamp-3">
              {excerpt}
            </span>
            <span className="hidden truncate sm:inline">{excerpt}</span>
          </>
        ) : null}
      </div>

      {(onView || onConfirm || onDismiss) && (
        <footer className="mt-3 flex flex-wrap items-center gap-2">
          {onView ? (
            <button
              type="button"
              onClick={onView}
              className="touch-target inline-flex h-10 items-center rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)] sm:h-7 sm:px-2.5 sm:text-xs"
              style={{
                background: 'transparent',
                borderColor: 'var(--app-border)',
                color: 'var(--app-fg)',
              }}
            >
              View
            </button>
          ) : null}
          {onConfirm ? (
            <button
              type="button"
              onClick={onConfirm}
              className="touch-target inline-flex h-10 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)] sm:h-7 sm:px-2.5 sm:text-xs"
              style={{
                background: 'var(--app-fg)',
                color: '#FFFFFF',
              }}
            >
              Confirm
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="touch-target inline-flex h-10 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)] sm:h-7 sm:px-2.5 sm:text-xs"
              style={{
                background: 'transparent',
                color: 'var(--app-fg-muted)',
              }}
            >
              Dismiss
            </button>
          ) : null}
        </footer>
      )}
    </article>
  );
}
