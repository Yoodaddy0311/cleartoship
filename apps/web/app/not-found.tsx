import Link from 'next/link';
import { Button, AuroraBackground } from '@cleartoship/ui';
import { t } from '@/lib/i18n';

export default function NotFound() {
  return (
    <AuroraBackground className="min-h-[calc(100dvh-3.5rem)]">
      <section
        aria-labelledby="nf-title"
        className="mx-auto flex w-full max-w-[640px] flex-col items-center gap-6 px-4 pt-24 pb-16 text-center sm:px-6"
      >
        <p className="text-aurora text-display-lg font-bold">404</p>
        <h1 id="nf-title" className="text-display-sm font-semibold text-[color:var(--color-fg-primary)]">
          {t('common.notFound.title')}
        </h1>
        <p className="text-md text-[color:var(--color-fg-secondary)]">
          {t('common.notFound.desc')}
        </p>
        <Link href="/" className="inline-flex">
          <Button variant="primary" size="lg">
            {t('common.notFound.cta')}
          </Button>
        </Link>
      </section>
    </AuroraBackground>
  );
}
