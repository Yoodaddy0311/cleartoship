import type { Metadata } from 'next';
import { UrlInputForm } from '@/components/audit-start/url-input-form';
import { t } from '@/lib/i18n';

export const metadata: Metadata = {
  title: t('home.hero.title'),
  description: t('mk.hero.subtitle'),
};

export default function AuditNewPage() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="text-balance text-3xl font-bold tracking-tight text-mk-fg sm:text-4xl">
          {t('home.hero.title')}
        </h1>
        <p className="text-base text-mk-fg-muted sm:text-lg">{t('mk.hero.subtitle')}</p>
      </header>
      <UrlInputForm />
    </section>
  );
}
