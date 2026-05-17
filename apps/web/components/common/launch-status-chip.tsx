import {
  launchStatusLabel,
  launchStatusToken,
  type LaunchStatus,
} from '@/lib/format/status';

// T2.11 #122: 모바일 가로 폭에서 "출시 가능 (개선 후)" 같은 한국어 풀라벨이
// chip 안에서 줄바꿈되어 카테고리 그리드를 깨뜨린다. 작은 화면에서는 핵심
// 동사 한 단어만 노출하고 sr-only로 풀 의미를 유지한다.
const SHORT_LABEL: Record<LaunchStatus, string> = {
  ready: '출시',
  ready_with_improvements: '보완',
  needs_work: '개선',
  stop: '차단',
  indeterminate: 'N/A',
  blocked: '중단',
};

export function LaunchStatusChip({ status }: { status: LaunchStatus }) {
  const color = launchStatusToken(status);
  const fullLabel = launchStatusLabel(status);
  return (
    <span
      role="status"
      className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-3 text-xs font-medium"
      style={{
        color,
        background: `color-mix(in oklch, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in oklch, ${color} 28%, transparent)`,
      }}
      // a11y: 시각 라벨이 모바일에서 단축되더라도 SR/AT는 항상 풀 라벨을
      // 받도록 aria-label로 고정.
      aria-label={fullLabel}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      <span className="sm:hidden" aria-hidden="true">
        {SHORT_LABEL[status]}
      </span>
      <span className="hidden truncate sm:inline" aria-hidden="true">
        {fullLabel}
      </span>
    </span>
  );
}
