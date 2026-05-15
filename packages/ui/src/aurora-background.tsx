import * as React from 'react';
import { cn } from './lib/cn';

export interface AuroraBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  /** When true, render the animated drift. Disabled automatically by `prefers-reduced-motion`. */
  animate?: boolean;
}

/**
 * AuroraBackground — full-bleed background gradient mesh.
 * Three radial gradients drift slowly per design-system §13.
 * Wraps `bg-mesh` utility from globals.css.
 */
export function AuroraBackground({
  className,
  animate = true,
  children,
  ...rest
}: AuroraBackgroundProps) {
  return (
    <div
      aria-hidden={!children ? 'true' : undefined}
      className={cn('relative isolate overflow-hidden', className)}
      {...rest}
    >
      <div
        className={cn(
          'pointer-events-none absolute -inset-[10%] bg-mesh',
          animate && 'aurora-animate'
        )}
      />
      {/* Subtle noise overlay for tactile texture (§13) */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.03] mix-blend-screen"
      >
        <filter id="aurora-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#aurora-noise)" />
      </svg>
      <div className="relative">{children}</div>
    </div>
  );
}
