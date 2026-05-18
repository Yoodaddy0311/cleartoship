import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { t } from '@/lib/i18n';
import { SpecialText } from './special-text';

export interface HeroProps {
  primaryHref?: string;
  secondaryHref?: string;
}

export function Hero({
  primaryHref = '/audits/new',
  secondaryHref = '/audits/demo',
}: HeroProps) {
  return (
    <section
      aria-labelledby="mk-hero-title"
      data-testid="hero-section"
      className="mx-auto w-full max-w-container px-6 pt-24 pb-20 sm:pt-32 sm:pb-28"
    >
      <div className="flex flex-col items-center text-center">
        <div data-testid="hero-brand-reveal" className="mb-4">
          <SpecialText className="text-base tracking-[0.2em] text-mk-fg-muted sm:text-lg">
            ClearToShip
          </SpecialText>
        </div>
        <span
          data-testid="hero-eyebrow"
          className="mb-6 inline-flex items-center rounded-mk-pill border border-app-border bg-mk-bg-soft px-4 py-1.5 text-sm text-mk-fg-muted"
        >
          {t('mk.hero.eyebrow')}
        </span>

        <h1
          id="mk-hero-title"
          data-testid="hero-headline"
          className="text-balance font-display font-bold tracking-tight text-mk-fg"
          style={{ fontSize: 'var(--mk-hero-size)', lineHeight: 1.05 }}
        >
          {t('mk.hero.title.pre')}{' '}
          <span data-testid="hero-headline-accent" className="mk-gradient-text">
            {t('mk.hero.title.accent')}
          </span>{' '}
          {t('mk.hero.title.post')}
        </h1>

        <p
          data-testid="hero-subtitle"
          className="mt-6 max-w-2xl text-lg text-mk-fg-muted sm:text-xl"
        >
          {t('mk.hero.subtitle')}
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <Link
            href={primaryHref}
            data-testid="hero-cta-primary"
            className="inline-flex items-center justify-center gap-2 rounded-mk-pill bg-mk-accent px-7 py-3.5 text-base font-medium text-white shadow-mk transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-mk-accent"
          >
            {t('mk.hero.cta.primary')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href={secondaryHref}
            data-testid="hero-cta-secondary"
            className="inline-flex items-center gap-1 text-base font-medium text-mk-accent hover:underline focus-visible:outline-2 focus-visible:outline-mk-accent"
          >
            {t('mk.hero.cta.secondary')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
