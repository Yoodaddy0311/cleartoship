import { EvidenceCard } from '@cleartoship/ui';
import type { MockEvidence } from '@/lib/mock/audit-fixture';

export function CodeEvidence({ evidence }: { evidence: MockEvidence }) {
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
