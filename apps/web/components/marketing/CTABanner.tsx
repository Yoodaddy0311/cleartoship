import Link from 'next/link';
import { t } from '@/lib/i18n';

export interface CTABannerProps {
  href?: string;
}

export function CTABanner({ href = '/audits/new' }: CTABannerProps) {
  return (
    <section
      aria-labelledby="mk-cta-title"
      className="bg-mk-gradient w-full"
    >
      <div className="mx-auto flex max-w-container flex-col items-center px-6 py-24 text-center sm:py-28">
        <h2
          id="mk-cta-title"
          className="text-3xl font-bold tracking-tight text-white sm:text-4xl"
        >
          {t('mk.cta.title')}
        </h2>
        <p className="mt-4 text-lg text-white/85">{t('mk.cta.subtitle')}</p>

        <Link
          href={href}
          className="mt-10 inline-flex items-center justify-center rounded-mk-pill bg-white px-8 py-3.5 text-base font-medium text-mk-fg shadow-mk transition hover:opacity-95 focus-visible:outline-2 focus-visible:outline-white"
        >
          {t('mk.cta.button')}
        </Link>
      </div>
    </section>
  );
}
