'use client';

import * as React from 'react';
import { cn } from './lib/cn';

export interface FilterChip {
  value: string;
  label: string;
  count?: number;
}

export interface FilterChipsProps {
  chips: FilterChip[];
  selected: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function FilterChips({
  chips,
  selected,
  onChange,
  multiple = true,
  className,
  'aria-label': ariaLabel,
}: FilterChipsProps) {
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  function toggle(value: string) {
    if (multiple) {
      const next = new Set(selectedSet);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      onChange(Array.from(next));
    } else {
      onChange(selectedSet.has(value) ? [] : [value]);
    }
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      // T2.11 #122: 모바일에서 칩이 많아지면 줄바꿈으로 세로 자리를 잡아먹는
      // 대신 가로 스크롤(snap)로 한 줄에 유지. sm 이상에서는 기존 flex-wrap.
      // .mobile-scroll-x는 overflow-x:auto + scroll-snap을 추가하고, sm 이상에서
      // flex-wrap이 적용되면 overflow-x:auto는 자연스럽게 영향 없음(콘텐츠가
      // 다 들어가므로 스크롤이 발생하지 않음).
      className={cn(
        'flex items-center gap-2',
        'flex-nowrap mobile-scroll-x sm:flex-wrap',
        className
      )}
    >
      {chips.map((chip) => {
        const isSelected = selectedSet.has(chip.value);
        return (
          <button
            key={chip.value}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={isSelected}
            data-selected={isSelected || undefined}
            onClick={() => toggle(chip.value)}
            // T2.11: 터치 타겟 ≥ 44px (WCAG 2.5.5). 데스크탑은 기존 7(28px) 유지
            // 위해 sm+에서 h-7로 다운사이즈. .touch-target 유틸이 coarse pointer
            // 미디어 쿼리로 min-h 44를 보장.
            className="touch-target inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)] sm:h-7 sm:px-3 sm:text-xs"
            style={
              isSelected
                ? { background: 'var(--app-fg)', color: '#FFFFFF' }
                : {
                    background: 'var(--app-chip-bg)',
                    color: 'var(--app-fg-muted)',
                  }
            }
          >
            <span>{chip.label}</span>
            {typeof chip.count === 'number' ? (
              <span
                className="inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px]"
                style={{
                  background: isSelected
                    ? 'rgba(255,255,255,0.18)'
                    : 'rgba(0,0,0,0.06)',
                }}
              >
                {chip.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
