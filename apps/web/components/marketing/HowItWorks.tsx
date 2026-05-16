import { t } from '@/lib/i18n';
import type { I18nKey } from '@/lib/i18n';

export interface Step {
  number: string;
  titleKey: I18nKey;
  descKey: I18nKey;
}

export const DEFAULT_STEPS: readonly Step[] = [
  { number: '01', titleKey: 'mk.how.s1.title', descKey: 'mk.how.s1.desc' },
  { number: '02', titleKey: 'mk.how.s2.title', descKey: 'mk.how.s2.desc' },
  { number: '03', titleKey: 'mk.how.s3.title', descKey: 'mk.how.s3.desc' },
];

export interface HowItWorksProps {
  steps?: readonly Step[];
}

export function HowItWorks({ steps = DEFAULT_STEPS }: HowItWorksProps = {}) {
  return (
    <section
      aria-labelledby="mk-how-title"
      data-testid="how-it-works"
      className="mx-auto w-full max-w-container px-6 py-24 sm:py-32"
    >
      <header className="mx-auto max-w-2xl text-center">
        <h2
          id="mk-how-title"
          data-testid="how-it-works-heading"
          className="text-3xl font-bold tracking-tight text-mk-fg sm:text-4xl"
        >
          {t('mk.how.title')}
        </h2>
      </header>

      <ol
        data-testid="how-it-works-list"
        className="mt-16 grid gap-8 sm:grid-cols-3"
      >
        {steps.map((step) => (
          <li
            key={step.number}
            data-testid="how-it-works-step"
            className="rounded-mk border border-app-border bg-mk-bg p-8 shadow-mk"
          >
            <span
              data-testid="how-it-works-step-number"
              className="mk-gradient-text text-4xl font-bold"
              aria-hidden="true"
            >
              {step.number}
            </span>
            <h3 className="mt-5 text-xl font-semibold text-mk-fg">{t(step.titleKey)}</h3>
            <p className="mt-3 text-base leading-relaxed text-mk-fg-muted">
              {t(step.descKey)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
