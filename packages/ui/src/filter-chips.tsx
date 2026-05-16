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
      className={cn('flex flex-wrap items-center gap-2', className)}
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
            className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)]"
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
