'use server';

// Sprint 4 L-P1-5 — server action invoked by `<LangToggle>` to flip the
// locale cookie and force a server re-render. Keeping this file at
// `app/actions/` so Next.js can correctly bundle the `'use server'` directive
// and so client components can import the function by name.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { setLocale, type Locale } from '@/lib/i18n/locale';

const LocaleSchema = z.enum(['ko', 'en']);

/**
 * Persist the chosen locale into the `cts.locale` cookie and re-render the
 * root layout so server components produce strings in the new language.
 *
 * Validation: zod enum guards against bogus values arriving via a tampered
 * client request — invalid input throws synchronously and the action
 * returns a 500 to the client (server actions surface thrown errors).
 */
export async function revalidateLang(locale: Locale): Promise<void> {
  const parsed = LocaleSchema.parse(locale);
  await setLocale(parsed);
  // 'layout' scope: clear the cached root layout + every nested page so the
  // `<html lang>` attribute and any server-rendered copy flips immediately.
  revalidatePath('/', 'layout');
}
