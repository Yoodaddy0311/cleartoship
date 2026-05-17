// T1.4 SEVERITY_LANGUAGE_KO — locale-aware severity label/description map.
//
// Korean wording is the source of truth and lives next to the Severity enum in
// `@cleartoship/shared-types/labels-ko.ts` as SEVERITY_LABELS_KO. We re-export
// it here under the LLM 03-A spec name (SEVERITY_LANGUAGE_KO) and add a
// sibling SEVERITY_LANGUAGE_EN for en-US fallback, plus a `getSeverityLanguage`
// resolver that report-renderer / UI surfaces call to pick the active map.
//
// Why a wrapper and not a fresh map: duplicating Korean strings would let the
// two diverge silently. Apps that already import SEVERITY_LABELS_KO keep
// working; new locale-aware callers route through getSeverityLanguage.

import {
  SEVERITY_LABELS_KO,
  type LabelWithDescription,
  type Severity,
} from '@cleartoship/shared-types';

export type SeverityLanguageMap = Record<Severity, LabelWithDescription>;

export const SEVERITY_LANGUAGE_KO: SeverityLanguageMap = SEVERITY_LABELS_KO;

export const SEVERITY_LANGUAGE_EN: SeverityLanguageMap = {
  P0: {
    label: 'Launch Blocker',
    description: 'Will cause immediate problems if launched as-is',
  },
  P1: {
    label: 'Strongly Recommended',
    description: 'Must be addressed before launch',
  },
  P2: {
    label: 'Recommended Improvement',
    description: 'Improves overall quality',
  },
  P3: {
    label: 'Long-term Polish',
    description: 'Nice to have when time allows',
  },
};

/**
 * Resolve the severity language map for a BCP47 locale tag.
 *
 * Rules:
 *   - Any tag whose primary language subtag is "ko" → SEVERITY_LANGUAGE_KO.
 *   - Anything else (including unknown tags or empty input) → SEVERITY_LANGUAGE_EN.
 *   - No argument → SEVERITY_LANGUAGE_KO (ko-KR is the project default).
 *
 * The resolver intentionally returns the *same* object reference each call so
 * callers can use `===` to detect locale changes cheaply.
 */
export function getSeverityLanguage(locale?: string): SeverityLanguageMap {
  if (locale === undefined) return SEVERITY_LANGUAGE_KO;
  const primary = locale.split('-')[0]?.toLowerCase() ?? '';
  if (primary === 'ko') return SEVERITY_LANGUAGE_KO;
  return SEVERITY_LANGUAGE_EN;
}
