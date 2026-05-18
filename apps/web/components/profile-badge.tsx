// L-P1-1: ProfileBadge — visualizes the audit profile chosen at start time.
// Renders nothing when `profileId` is null/undefined (the default no-bias case)
// so dashboards stay quiet for non-domain audits. Color tokens map to the
// audit-core profile group so a "saas" badge reads as "backend-leaning" at a
// glance — kept inline (no design-token file) because the four profiles share
// only this widget today.

import { t } from '@/lib/i18n';
import type { I18nKey } from '@/lib/i18n';

type KnownProfile = 'landing' | 'saas' | 'ecommerce' | 'vibe-coded';

const PROFILE_TOKEN: Record<KnownProfile, string> = {
  landing: 'var(--sev-p3)',
  saas: 'var(--app-accent)',
  ecommerce: 'var(--sev-p2)',
  'vibe-coded': 'var(--app-fg-muted)',
};

// Mobile-truncated label kept in component to avoid an extra i18n round-trip
// for a 1-word string (matches LaunchStatusChip's SHORT_LABEL pattern).
const SHORT_LABEL: Record<KnownProfile, string> = {
  landing: '랜딩',
  saas: 'SaaS',
  ecommerce: '이커머스',
  'vibe-coded': '바이브',
};

const LABEL_KEY: Record<KnownProfile, I18nKey> = {
  landing: 'home.form.profile.option.landing',
  saas: 'home.form.profile.option.saas',
  ecommerce: 'home.form.profile.option.ecommerce',
  'vibe-coded': 'home.form.profile.option.vibeCoded',
};

function isKnownProfile(id: string): id is KnownProfile {
  return id in PROFILE_TOKEN;
}

export function ProfileBadge({ profileId }: { profileId: string | null }) {
  if (profileId == null || !isKnownProfile(profileId)) return null;
  const color = PROFILE_TOKEN[profileId];
  const fullLabel = t(LABEL_KEY[profileId]);
  const shortLabel = SHORT_LABEL[profileId];
  return (
    <span
      role="status"
      data-profile={profileId}
      className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-3 text-xs font-medium"
      style={{
        color,
        background: `color-mix(in oklch, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in oklch, ${color} 28%, transparent)`,
      }}
      aria-label={fullLabel}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      <span className="sm:hidden" aria-hidden="true">
        {shortLabel}
      </span>
      <span className="hidden truncate sm:inline" aria-hidden="true">
        {fullLabel}
      </span>
    </span>
  );
}
