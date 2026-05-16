import Link from 'next/link';
import { Button } from '@cleartoship/ui';
import { t } from '@/lib/i18n';

export default function NotFound() {
  return (
    <section
      aria-labelledby="nf-title"
      className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-6 px-4 pt-24 pb-16 text-center sm:px-6"
    >
      <p className="mk-gradient-text text-7xl font-bold">404</p>
      <h1 id="nf-title" className="text-3xl font-semibold text-mk-fg">
        {t('common.notFound.title')}
      </h1>
      <p className="text-base text-mk-fg-muted">{t('common.notFound.desc')}</p>
      <Link href="/" className="inline-flex">
        <Button variant="primary" size="lg">
          {t('common.notFound.cta')}
        </Button>
      </Link>
    </section>
  );
}
