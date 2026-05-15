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

function bandStops(score: number): [string, string] {
  // (start, end) gradient stops per design-system §8.9
  if (score >= 85) return ['#06B6D4', '#5BC2A0']; // plasma-cyan → green
  if (score >= 70) return ['#3B82F6', '#06B6D4']; // nebula-blue → plasma-cyan
  if (score >= 55) return ['#FFD93D', '#FFD93D']; // P2
  if (score >= 40) return ['#FF8A3D', '#FF8A3D']; // P1
  return ['#FF3B69', '#FF3B69']; // P0
}

function bandGlow(score: number): string {
  if (score >= 85) return '0 0 24px rgba(6,182,212,0.45)';
  if (score < 40) return '0 0 24px rgba(236,72,153,0.45)';
  return 'none';
}

/**
 * ScoreRing — circular gauge 0-100.
 * Aurora gradient stroke via SVG <linearGradient>, score band selected from §8.9.
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
  const [stopA, stopB] = bandStops(clamped);
  const glow = bandGlow(clamped);
  const gradId = React.useId();

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? `점수 ${clamped}점, 100점 만점`}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size, filter: `drop-shadow(${glow})` }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={stopA} />
            <stop offset="100%" stopColor={stopB} />
          </linearGradient>
        </defs>
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        {/* progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradId})`}
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
          className="font-mono tabular-nums text-[color:var(--color-fg-primary)]"
          style={{ fontSize: size * 0.28, lineHeight: 1.1, fontWeight: 700 }}
        >
          {clamped}
        </span>
        {caption ? (
          <span
            className="mt-1 text-sm text-[color:var(--color-fg-secondary)]"
            style={{ maxWidth: size * 0.8 }}
          >
            {caption}
          </span>
        ) : null}
      </div>
    </div>
  );
}
