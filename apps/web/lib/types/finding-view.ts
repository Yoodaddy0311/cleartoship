/**
 * UI view-model for findings. Both live findings (from the API) and fixture
 * data adapt into this shape, so the rendering layer never depends on which
 * source produced the data.
 */
import type { AuditCategory } from '@/lib/format/category';
import type { Severity } from '@/lib/format/severity';

export type FindingConfidence = 'high' | 'medium' | 'low';

export interface FindingEvidenceView {
  id: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  url?: string;
  selector?: string;
  snippet?: string;
  language?: string;
  maskedSecret?: boolean;
}

export interface FindingViewModel {
  id: string;
  title: string;
  category: AuditCategory;
  severity: Severity;
  confidence: FindingConfidence;
  summary: string;
  nonDeveloperExplanation: string;
  technicalExplanation: string;
  impact: string[];
  recommendation: string[];
  acceptanceCriteria: string[];
  evidences: FindingEvidenceView[];
}
