'use client';

import { useEffect, useRef } from 'react';

export interface FindingPopoverProps {
  /** Node id this popover is anchored to. */
  nodeId: string;
  /** Display label of the source node (announced to screen readers). */
  nodeLabel: string;
  /** Finding ids to show as deep links. */
  findingIds: ReadonlyArray<string>;
  /** Invoked when the user picks a finding id (mouse or keyboard). */
  onSelect: (findingId: string) => void;
  /** Invoked when the popover requests to close (Escape / outside click). */
  onDismiss: () => void;
}

/**
 * Multi-finding picker rendered inline beside the graph.
 * Listed when a clicked node has 2+ associated findings — each row deep-links
 * to /audits/[id]/findings/[findingId]. Keyboard accessible (Esc dismiss,
 * Enter activates rows via native <button>).
 */
export function FindingPopover({
  nodeId,
  nodeLabel,
  findingIds,
  onSelect,
  onDismiss,
}: FindingPopoverProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    firstItemRef.current?.focus();
  }, [nodeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`finding-popover-title-${nodeId}`}
      data-testid="finding-popover"
      className="flex flex-col gap-2 rounded-[12px] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)] p-3 shadow-[var(--elev-2)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p
          id={`finding-popover-title-${nodeId}`}
          className="text-xs text-[color:var(--color-fg-muted)]"
        >
          <span className="text-[color:var(--color-fg-primary)]">{nodeLabel}</span>
          {' '}관련 Finding {findingIds.length}건
        </p>
        <button
          type="button"
          aria-label="목록 닫기"
          onClick={onDismiss}
          className="rounded-md px-2 py-1 text-xs text-[color:var(--color-fg-muted)] hover:bg-[color:var(--app-bg-soft)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)]"
        >
          닫기
        </button>
      </div>
      <ul role="list" className="flex flex-col gap-1">
        {findingIds.map((id, idx) => (
          <li key={id}>
            <button
              ref={idx === 0 ? firstItemRef : undefined}
              type="button"
              onClick={() => onSelect(id)}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-[color:var(--color-fg-primary)] hover:bg-[color:var(--app-bg-soft)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)]"
            >
              <span className="font-mono text-xs text-[color:var(--color-fg-muted)]">{id}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
