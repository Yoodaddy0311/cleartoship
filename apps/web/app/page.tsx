import { AuroraBackground, Card, CardBody } from '@cleartoship/ui';
import { UrlInputForm } from '@/components/audit-start/url-input-form';
import { t } from '@/lib/i18n';

export default function HomePage() {
  return (
    <AuroraBackground className="min-h-[calc(100dvh-3.5rem)]">
      <section
        aria-labelledby="hero-title"
        className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-10 px-4 pt-16 pb-24 sm:px-6 sm:pt-24"
      >
        <header className="flex max-w-[820px] flex-col items-center text-center">
          <span className="mb-3 inline-flex h-7 items-center rounded-full border border-[color:var(--color-border-default)] bg-[rgba(255,255,255,0.04)] px-3 text-xs text-[color:var(--color-fg-secondary)]">
            {t('home.hero.eyebrow')}
          </span>
          <h1
            id="hero-title"
            className="text-aurora text-balance text-[clamp(2.25rem,6vw,4rem)] font-bold leading-[1.12] tracking-tight"
          >
            {t('home.hero.title')}
          </h1>
          <p className="mt-5 max-w-[640px] text-[color:var(--color-fg-secondary)] text-lg leading-[1.55]">
            {t('home.hero.subtitle')}
          </p>
        </header>

        <UrlInputForm />

        <section
          aria-labelledby="preview-title"
          className="mt-8 flex w-full max-w-[1080px] flex-col gap-6"
        >
          <h2
            id="preview-title"
            className="text-center text-lg text-[color:var(--color-fg-secondary)]"
          >
            {t('home.preview.title')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <PreviewCard
              title={t('home.preview.card1.title')}
              desc={t('home.preview.card1.desc')}
            />
            <PreviewCard
              title={t('home.preview.card2.title')}
              desc={t('home.preview.card2.desc')}
            />
            <PreviewCard
              title={t('home.preview.card3.title')}
              desc={t('home.preview.card3.desc')}
            />
          </div>
        </section>
      </section>
    </AuroraBackground>
  );
}

function PreviewCard({ title, desc }: { title: string; desc: string }) {
  return (
    <Card variant="glass" padding="md" className="h-full">
      <CardBody>
        <h3 className="text-md font-semibold text-[color:var(--color-fg-primary)]">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-[1.55] text-[color:var(--color-fg-secondary)]">
          {desc}
        </p>
      </CardBody>
    </Card>
  );
}
