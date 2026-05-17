import { EvidenceCard } from '@cleartoship/ui';
import type { FindingEvidenceView } from '@/lib/types/finding-view';

/**
 * Screenshot evidence — when a screenshot URL is present, show as image
 * with file/URL caption. Falls back to plain EvidenceCard for URL-only items.
 */
export function ScreenshotEvidence({ evidence }: { evidence: FindingEvidenceView }) {
  return (
    <figure className="overflow-hidden rounded-[12px] border border-[color:var(--color-border-subtle)] bg-[color:var(--color-bg-elevated)]">
      {evidence.url ? (
        <img
          src={evidence.url}
          alt="스크린샷 근거 자료"
          loading="lazy"
          decoding="async"
          className="block w-full h-auto"
        />
      ) : null}
      <figcaption className="border-t border-[color:var(--color-border-subtle)] px-3 py-2 text-xs text-[color:var(--color-fg-muted)]">
        <EvidenceCard
          {...(evidence.url !== undefined ? { url: evidence.url } : {})}
          {...(evidence.selector !== undefined ? { selector: evidence.selector } : {})}
          caption={evidence.selector ? `선택자: ${evidence.selector}` : undefined}
        />
      </figcaption>
    </figure>
  );
}
