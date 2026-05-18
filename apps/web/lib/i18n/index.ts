import { ko, type I18nKey } from './ko';
import { en } from './en';
import { DEFAULT_LOCALE, type Locale } from './locale';

const MESSAGES: Record<Locale, Record<string, string>> = {
  ko,
  en,
};

/**
 * t() — translation helper.
 *
 * Locale resolution:
 *  - If `locale` is passed explicitly, use that map.
 *  - Otherwise fall back to `DEFAULT_LOCALE` (ko) so existing callers that
 *    don't yet thread `locale` keep producing identical output (zero
 *    behaviour change for un-migrated call sites — Wave 3 migrates them).
 * Returns the key itself if missing, so we never crash on a typo.
 */
export function t(key: I18nKey, locale: Locale = DEFAULT_LOCALE): string {
  const map = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  return map[key] ?? ko[key] ?? key;
}

/**
 * tf() — formatted helper. Replaces `{name}` placeholders. Same locale
 * resolution rules as `t()`.
 */
export function tf(
  key: I18nKey,
  params: Record<string, string | number>,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const map = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  const template = map[key] ?? ko[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`
  );
}

export type { I18nKey } from './ko';
export type { Locale } from './locale';
export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  LOCALE_COOKIE_NAME,
  getLocale,
  getLocaleFromDocument,
  setLocale,
  isLocale,
  normalizeLocale,
} from './locale';
