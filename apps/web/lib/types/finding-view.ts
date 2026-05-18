/**
 * UI view-model for findings. Both live findings (from the API) and fixture
 * data adapt into this shape, so the rendering layer never depends on which
 * source produced the data.
 */
import type { AuditCategory } from '@/lib/format/category';
import type { Severity } from '@/lib/format/severity';

export type FindingConfidence = 'high' | 'medium' | 'low';

/**
 * ActionHint (L-P0-6) — 다음 행동 한 줄 + ETA. `etaMinutes` 는 5/30/60/240 ladder
 * 로 제한 (Appendix D dictionary SSOT). UI 는 `5분 / 30분 / 1시간 / 반나절+` 로
 * 렌더한다. Schema 가 finding 단위로 optional 이므로 view-model 도 optional.
 */
export type ActionHintEtaView = 5 | 30 | 60 | 240;

export interface ActionHintView {
  text: string;
  etaMinutes: ActionHintEtaView;
  referenceUrl?: string;
}

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
  actionHint?: ActionHintView;
}
