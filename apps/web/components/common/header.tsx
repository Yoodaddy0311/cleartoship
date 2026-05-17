import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { t } from '@/lib/i18n';

/**
 * Top navigation — glass bar with brand mark.
 * Skip-to-content link for keyboard users (WCAG 2.4.1).
 */
export function Header() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-[200] focus-visible:rounded-md focus-visible:bg-[color:var(--color-bg-elevated)] focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:shadow-[var(--focus-ring)]"
      >
        {t('common.skipToMain')}
      </a>
      <header
        className="sticky top-0 z-50 border-b border-[color:var(--color-border-subtle)] safe-area-top"
        style={{
          background: 'rgba(7,7,11,0.6)',
          backdropFilter: 'blur(16px) saturate(140%)',
          WebkitBackdropFilter: 'blur(16px) saturate(140%)',
        }}
      >
        <div className="mx-auto flex h-14 w-full max-w-[1536px] items-center justify-between px-4 safe-area-x sm:px-6">
          <Link
            href="/"
            aria-label={t('app.brand')}
            className="inline-flex items-center gap-2 rounded-md px-1 py-1 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-md"
              style={{ background: 'var(--mk-gradient)' }}
            >
              <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
            </span>
            <span className="text-md font-semibold tracking-tight text-[color:var(--color-fg-primary)]">
              {t('app.brand')}
            </span>
          </Link>

          <nav
            aria-label="primary"
            className="flex items-center gap-1 text-sm text-[color:var(--color-fg-secondary)]"
          >
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 hover:bg-[rgba(255,255,255,0.04)] hover:text-[color:var(--color-fg-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              {t('nav.home')}
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}
