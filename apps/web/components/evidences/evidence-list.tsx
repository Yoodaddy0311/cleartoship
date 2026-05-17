import { CodeEvidence } from './code-evidence';
import { ScreenshotEvidence } from './screenshot-evidence';
import type { FindingEvidenceView } from '@/lib/types/finding-view';

export function EvidenceList({ items }: { items: FindingEvidenceView[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[color:var(--color-fg-muted)]">
        등록된 근거 자료가 없습니다.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((e) => (
        <li key={e.id}>
          {e.url && !e.snippet ? (
            <ScreenshotEvidence evidence={e} />
          ) : (
            <CodeEvidence evidence={e} />
          )}
        </li>
      ))}
    </ul>
  );
}
