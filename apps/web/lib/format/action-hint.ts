import { t } from '@/lib/i18n';
import type { ActionHintEtaView } from '@/lib/types/finding-view';

/**
 * Returns the localized label for the 5/30/60/240-minute ladder defined by
 * `ActionHintEtaSchema` (shared-types L-P0-6). Falls back to the numeric form
 * for future ladder additions so a schema-side widening doesn't break the UI.
 */
export function etaLabel(minutes: ActionHintEtaView | number): string {
  switch (minutes) {
    case 5:
      return t('findings.actionHint.eta.5');
    case 30:
      return t('findings.actionHint.eta.30');
    case 60:
      return t('findings.actionHint.eta.60');
    case 240:
      return t('findings.actionHint.eta.240');
    default:
      return `${minutes}분`;
  }
}
