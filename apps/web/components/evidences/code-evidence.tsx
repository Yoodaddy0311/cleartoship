import { EvidenceCard } from '@cleartoship/ui';
import type { FindingEvidenceView } from '@/lib/types/finding-view';

export function CodeEvidence({ evidence }: { evidence: FindingEvidenceView }) {
  return (
    <EvidenceCard
      {...(evidence.filePath !== undefined ? { filePath: evidence.filePath } : {})}
      {...(evidence.lineStart !== undefined ? { lineStart: evidence.lineStart } : {})}
      {...(evidence.lineEnd !== undefined ? { lineEnd: evidence.lineEnd } : {})}
      {...(evidence.snippet !== undefined ? { snippet: evidence.snippet } : {})}
      {...(evidence.language !== undefined ? { language: evidence.language } : {})}
      {...(evidence.maskedSecret !== undefined ? { maskedSecret: evidence.maskedSecret } : {})}
    />
  );
}
