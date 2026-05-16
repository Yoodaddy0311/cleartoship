'use client';

import * as React from 'react';
import {
  Boxes,
  Sparkles,
  FileText,
  Component as ComponentIcon,
  MousePointerClick,
  ServerCog,
  Database,
  Cloud,
  Shield,
  CircleDot,
  Lightbulb,
} from 'lucide-react';
import { cn } from './lib/cn';

export type FeatureNodeType =
  | 'product_area'
  | 'feature'
  | 'page'
  | 'component'
  | 'action'
  | 'api'
  | 'data_model'
  | 'external_service'
  | 'auth_guard'
  | 'state'
  | 'recommended_feature';

export type ImplementationStatus =
  | 'complete'
  | 'partial'
  | 'ui_only'
  | 'logic_only'
  | 'missing_connection'
  | 'missing'
  | 'risky'
  | 'recommended'
  | 'unknown';

const TYPE_ICON: Record<FeatureNodeType, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  product_area: Boxes,
  feature: Sparkles,
  page: FileText,
  component: ComponentIcon,
  action: MousePointerClick,
  api: ServerCog,
  data_model: Database,
  external_service: Cloud,
  auth_guard: Shield,
  state: CircleDot,
  recommended_feature: Lightbulb,
};

const STATUS_VAR: Record<ImplementationStatus, string> = {
  complete: '--sev-p3',
  partial: '--sev-p2',
  ui_only: '--sev-p2',
  logic_only: '--sev-p2',
  missing_connection: '--sev-p1',
  missing: '--sev-p0',
  risky: '--sev-p1',
  recommended: '--sev-p3',
  unknown: '--app-fg-muted',
};

const STATUS_LABEL: Record<ImplementationStatus, string> = {
  complete: '구현 완료',
  partial: '부분 구현',
  ui_only: 'UI만 구현',
  logic_only: '로직만 구현',
  missing_connection: '연결 누락',
  missing: '미구현',
  risky: '주의',
  recommended: '권장',
  unknown: '미확인',
};

const SIZE_BY_TYPE: Record<FeatureNodeType, { w: number; h: number }> = {
  product_area: { w: 200, h: 60 },
  feature: { w: 160, h: 52 },
  page: { w: 140, h: 44 },
  component: { w: 140, h: 44 },
  action: { w: 140, h: 44 },
  api: { w: 140, h: 44 },
  data_model: { w: 140, h: 44 },
  external_service: { w: 140, h: 44 },
  auth_guard: { w: 140, h: 44 },
  state: { w: 140, h: 44 },
  recommended_feature: { w: 140, h: 44 },
};

export interface FeatureGraphNodeProps {
  type: FeatureNodeType;
  status: ImplementationStatus;
  label: string;
  /** Render in selected (focused / highlighted) state. */
  selected?: boolean;
  /** Optional summary shown under label (truncated). */
  summary?: string;
  className?: string;
  onClick?: () => void;
  /** For React Flow integration — handles are added by parent. */
  children?: React.ReactNode;
}

/**
 * Feature Graph Node — flat app surface card with type icon + status color.
 * Status maps to fill + border color; type maps to icon.
 * Shape variations (dashed for missing_connection, double border for external_service) preserved.
 */
export function FeatureGraphNode({
  type,
  status,
  label,
  selected,
  summary,
  className,
  onClick,
  children,
}: FeatureGraphNodeProps) {
  const Icon = TYPE_ICON[type];
  const colorVar = STATUS_VAR[status];
  const { w, h } = SIZE_BY_TYPE[type];
  const isDashed = status === 'missing_connection';
  const isDoubleBorder = type === 'external_service';
  const statusText = STATUS_LABEL[status];

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={onClick ? `${label} — ${statusText}` : undefined}
      className={cn(
        'group relative flex items-center gap-2 rounded-[12px] px-3',
        'bg-[color:var(--app-surface)]',
        'transition-[box-shadow,transform,border-color] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mk-accent)]',
        onClick && 'cursor-pointer',
        className
      )}
      style={{
        width: w,
        minHeight: h,
        borderWidth: isDoubleBorder ? 3 : 1,
        borderStyle: isDashed ? 'dashed' : 'solid',
        borderColor: `color-mix(in oklch, var(${colorVar}) 60%, transparent)`,
        boxShadow: selected
          ? `0 0 0 2px var(--mk-accent)`
          : 'var(--elev-1)',
      }}
    >
      <Icon
        aria-hidden="true"
        className="h-4 w-4 shrink-0"
        style={{ color: `var(${colorVar})` }}
      />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm text-[color:var(--app-fg)]">
          {label}
        </span>
        {summary ? (
          <span className="truncate text-[10px] text-[color:var(--app-fg-muted)]">
            {summary}
          </span>
        ) : null}
      </div>
      <span className="sr-only">{statusText}</span>
      {children}
    </div>
  );
}
