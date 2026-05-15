import * as React from 'react';
import { cn } from './lib/cn';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Tailwind width/height utility (e.g., "h-4 w-32"). */
  size?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

const radiusMap = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
} as const;

/**
 * Skeleton — aurora-tinted shimmer. Use `size` for dimensions or `className`.
 * a11y: aria-hidden + animate-pulse fallback (CSS gradient sweep when motion ok).
 */
export function Skeleton({
  className,
  size,
  rounded = 'md',
  ...rest
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'skeleton-sweep',
        radiusMap[rounded],
        'animate-pulse',
        size,
        className
      )}
      {...rest}
    />
  );
}
