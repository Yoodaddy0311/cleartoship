import { ko, type I18nKey } from './ko';

/**
 * t() — translation helper. Sprint 0 supports ko-KR only.
 * Returns the key itself if missing, so we never crash on a typo.
 */
export function t(key: I18nKey): string {
  return ko[key] ?? key;
}

/**
 * tf() — formatted helper. Replaces `{name}` placeholders.
 */
export function tf(key: I18nKey, params: Record<string, string | number>): string {
  const template = ko[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`
  );
}

export type { I18nKey } from './ko';
