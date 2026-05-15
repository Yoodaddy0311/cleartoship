import {
  launchStatusLabel,
  launchStatusToken,
  type LaunchStatus,
} from '@/lib/format/status';

export function LaunchStatusChip({ status }: { status: LaunchStatus }) {
  const color = launchStatusToken(status);
  return (
    <span
      role="status"
      className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium"
      style={{
        color,
        background: `color-mix(in oklch, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in oklch, ${color} 28%, transparent)`,
      }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      {launchStatusLabel(status)}
    </span>
  );
}
