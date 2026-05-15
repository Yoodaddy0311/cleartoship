import { Badge } from '@cleartoship/ui';
import { statusLabel, type ImplementationStatus } from '@/lib/format/status';

export function StatusChip({
  status,
}: {
  status: ImplementationStatus;
}) {
  return (
    <Badge variant={status} aria-label={`구현 상태 ${statusLabel(status)}`}>
      {statusLabel(status)}
    </Badge>
  );
}
