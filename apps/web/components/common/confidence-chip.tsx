import type { FindingConfidence } from '@/lib/types/finding-view';

const LABEL_KO: Record<FindingConfidence, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
};

const COLOR_TOKEN: Record<FindingConfidence, string> = {
  high: 'var(--sev-p3)',
  medium: 'var(--sev-p2)',
  low: 'var(--app-fg-muted)',
};

export function ConfidenceChip({
  confidence,
  showLabel = true,
}: {
  confidence: FindingConfidence;
  showLabel?: boolean;
}) {
  const color = COLOR_TOKEN[confidence];
  const label = LABEL_KO[confidence];
  return (
    <span
      aria-label={`신뢰도: ${label}`}
      data-confidence={confidence}
      className="inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap select-none"
      style={{
        color,
        backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in oklch, ${color} 24%, transparent)`,
      }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {showLabel ? <span>신뢰도 {label}</span> : <span>{label}</span>}
    </span>
  );
}
