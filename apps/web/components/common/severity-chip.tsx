import { Badge } from '@cleartoship/ui';
import { severityLabel, type Severity } from '@/lib/format/severity';

export function SeverityChip({
  severity,
  showLabel = true,
}: {
  severity: Severity;
  showLabel?: boolean;
}) {
  const label = severityLabel(severity);
  return (
    <Badge variant={severity} aria-label={`위험도 ${severity} ${label}`}>
      <span className="font-mono">{severity}</span>
      {showLabel ? <span className="ml-1">{label}</span> : null}
    </Badge>
  );
}
