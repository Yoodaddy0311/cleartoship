import * as React from 'react';
import { cn } from './lib/cn';

export interface ScoreRingProps {
  /** 0-100 */
  score: number;
  /** Short text under the score (e.g., launch status). */
  caption?: string;
  /** Pixel size of the ring. Default 200. */
  size?: number;
  stroke?: number;
  /** Optional aria-label for the ring as a whole. */
  ariaLabel?: string;
  className?: string;
}

function bandColor(score: number): string {
  if (score >= 85) return 'var(--sev-p3)';
  if (score >= 70) return 'var(--sev-p3)';
  if (score >= 55) return 'var(--sev-p2)';
  if (score >= 40) return 'var(--sev-p1)';
  return 'var(--sev-p0)';
}

/**
 * ScoreRing — circular gauge 0-100.
 * Flat severity color stroke, no glow/gradient (light theme).
 */
export function ScoreRing({
  score,
  caption,
  size = 200,
  stroke = 14,
  ariaLabel,
  className,
}: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circ;
  const color = bandColor(clamped);

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `점수 ${clamped}점, 100점 만점`}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--app-border)"
          strokeWidth={stroke}
        />
        {/* progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ * 0.25}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition:
              'stroke-dasharray var(--duration-slow) var(--ease-standard)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-mono tabular-nums text-[color:var(--app-fg)]"
          style={{ fontSize: size * 0.28, lineHeight: 1.1, fontWeight: 700 }}
        >
          {clamped}
        </span>
        {caption ? (
          <span
            className="mt-1 text-sm text-[color:var(--app-fg-muted)]"
            style={{ maxWidth: size * 0.8 }}
          >
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
}
