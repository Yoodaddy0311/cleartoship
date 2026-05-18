'use client';

// Sprint 4 L-P1-5 — KO/EN locale toggle.
//
// The toggle owns no global state: it receives the SSR-resolved locale via
// `initialLocale`, mirrors that into local state for instant optimistic UI,
// and calls the server action `revalidateLang(next)` to persist the choice
// + invalidate the cached root layout. `router.refresh()` then re-fetches
// the server-rendered tree so the new locale propagates everywhere.
//
// a11y: rendered as a `role="group"` of two `aria-pressed` buttons (toggle
// button pattern, WAI-ARIA APG). Active button is also `aria-current="true"`
// for AT that prefers landmark-style cues.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@cleartoship/ui';
import { revalidateLang } from '@/app/actions/revalidate-lang';
import type { Locale } from '@/lib/i18n/locale';

interface LangToggleProps {
  initialLocale: Locale;
  className?: string;
}

const OPTIONS: ReadonlyArray<{ value: Locale; label: string; aria: string }> = [
  { value: 'ko', label: 'KO', aria: '한국어' },
  { value: 'en', label: 'EN', aria: 'English' },
];

export function LangToggle({ initialLocale, className }: LangToggleProps) {
  // `useState(initialLocale)` keeps SSR + first client render identical so
  // hydration matches. The cookie is the source of truth, but we don't read
  // it on the client to avoid SSR/CSR divergence on first paint.
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function pick(next: Locale) {
    if (next === locale || pending) return;
    setLocaleState(next); // optimistic
    startTransition(() => {
      void (async () => {
        try {
          await revalidateLang(next);
          router.refresh();
        } catch {
          // Roll back optimistic state if the action failed.
          setLocaleState(locale);
        }
      })();
    });
  }

  return (
    <div
      role="group"
      aria-label="Language"
      data-testid="lang-toggle"
      // The cookie is read on the server for `<html lang>`, and the toggle
      // mirrors that into state. Hydration is therefore stable, but we keep
      // `suppressHydrationWarning` defensively because some browsers
      // pre-fill cookies that diverge from server reads on bf-cache restore.
      suppressHydrationWarning
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border p-0.5 text-xs',
        'border-[color:var(--color-border-subtle)]',
        'bg-[rgba(255,255,255,0.02)]',
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === locale;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            aria-current={active ? 'true' : undefined}
            aria-label={opt.aria}
            disabled={pending}
            onClick={() => pick(opt.value)}
            data-testid={`lang-toggle-${opt.value}`}
            className={cn(
              'inline-flex min-w-[2rem] items-center justify-center rounded px-2 py-1 font-medium transition-colors',
              'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'bg-[color:var(--color-bg-elevated)] text-[color:var(--color-fg-primary)]'
                : 'text-[color:var(--color-fg-secondary)] hover:text-[color:var(--color-fg-primary)]',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
