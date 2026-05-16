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
 * Skeleton — flat surface shimmer placeholder.
 * a11y: aria-hidden; animate-pulse provides a motion-friendly fallback.
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
        'bg-[color:var(--app-border)] animate-pulse',
        radiusMap[rounded],
        size,
        className
      )}
      {...rest}
    />
  );
}
