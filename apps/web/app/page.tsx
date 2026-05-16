import { Gauge, FileSearch, FileCode2 } from 'lucide-react';
import { Hero } from '@/components/marketing/Hero';
import { FeatureCard } from '@/components/marketing/FeatureCard';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { CTABanner } from '@/components/marketing/CTABanner';
import { t } from '@/lib/i18n';

const TRUST_LOGOS = ['Repo A', 'Repo B', 'Repo C', 'Repo D', 'Repo E', 'Repo F'];

export default function HomePage() {
  return (
    <>
      <Hero />

      <section
        aria-label={t('mk.trust.title')}
        className="border-y border-app-border bg-mk-bg-soft"
      >
        <div className="mx-auto max-w-container px-6 py-10">
          <p className="text-center text-sm text-mk-fg-muted">{t('mk.trust.title')}</p>
          <ul className="mt-6 grid grid-cols-3 items-center gap-6 sm:grid-cols-6">
            {TRUST_LOGOS.map((label) => (
              <li
                key={label}
                className="flex h-10 items-center justify-center rounded-mk bg-mk-bg text-xs font-medium text-mk-fg-muted/70"
                aria-hidden="true"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="mk-features-title"
        className="mx-auto w-full max-w-container px-6 py-24 sm:py-32"
      >
        <header className="mx-auto max-w-2xl text-center">
          <h2
            id="mk-features-title"
            className="text-3xl font-bold tracking-tight text-mk-fg sm:text-4xl"
          >
            {t('mk.features.title')}
          </h2>
          <p className="mt-4 text-lg text-mk-fg-muted">{t('mk.features.subtitle')}</p>
        </header>

        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          <FeatureCard
            icon={Gauge}
            title={t('mk.features.f1.title')}
            description={t('mk.features.f1.desc')}
          />
          <FeatureCard
            icon={FileSearch}
            title={t('mk.features.f2.title')}
            description={t('mk.features.f2.desc')}
          />
          <FeatureCard
            icon={FileCode2}
            title={t('mk.features.f3.title')}
            description={t('mk.features.f3.desc')}
          />
        </div>
      </section>

      <HowItWorks />

      <CTABanner />
    </>
  );
}
