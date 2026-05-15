import { Badge } from '@cleartoship/ui';
import type { Severity } from '@/lib/format/severity';

const LABEL: Record<Severity, string> = {
  P0: '출시 차단',
  P1: '핵심 개선',
  P2: '품질 개선',
  P3: '장기 개선',
};

export function SeverityChip({
  severity,
  showLabel = true,
}: {
  severity: Severity;
  showLabel?: boolean;
}) {
  return (
    <Badge variant={severity} aria-label={`위험도 ${severity}`}>
      <span className="font-mono">{severity}</span>
      {showLabel ? <span className="ml-1">{LABEL[severity]}</span> : null}
    </Badge>
  );
}
