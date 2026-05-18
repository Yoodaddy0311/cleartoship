import type { Metadata } from 'next';
import { SampleCard } from '@/components/samples/sample-card';
import { SAMPLE_REPOS } from '@/lib/sample-repos';
import { t } from '@/lib/i18n';

export const metadata: Metadata = {
  title: t('samples.title'),
  description: t('samples.subtitle'),
};

export default function SamplesPage() {
  return (
    <section
      aria-labelledby="samples-title"
      className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 sm:py-16"
    >
      <header className="flex flex-col gap-3 text-center">
        <h1
          id="samples-title"
          className="text-balance text-3xl font-bold tracking-tight text-[color:var(--app-fg)] sm:text-4xl"
        >
          {t('samples.title')}
        </h1>
        <p className="mx-auto max-w-2xl text-base text-[color:var(--app-fg-muted)] sm:text-lg">
          {t('samples.subtitle')}
        </p>
      </header>

      <ul
        role="list"
        className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {SAMPLE_REPOS.map((sample) => (
          <li key={sample.id} className="h-full">
            <SampleCard sample={sample} />
          </li>
        ))}
      </ul>
    </section>
  );
}
