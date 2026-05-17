'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, Github } from 'lucide-react';
import { Button, Card, CardBody } from '@cleartoship/ui';
import { LaunchStatusChip } from '@/components/common/launch-status-chip';
import { t, tf } from '@/lib/i18n';
import type { SampleRepo } from '@/lib/sample-repos';

const TAG_LABEL_KEY = {
  benchmark: 'samples.tag.benchmark',
  typicalIssues: 'samples.tag.typicalIssues',
  minimal: 'samples.tag.minimal',
} as const;

const TAG_TOKEN: Record<SampleRepo['tag'], string> = {
  benchmark: 'var(--color-severity-p3)',
  typicalIssues: 'var(--color-severity-p1)',
  minimal: 'var(--color-fg-muted)',
};

interface SampleCardProps {
  sample: SampleRepo;
}

export function SampleCard({ sample }: SampleCardProps) {
  const router = useRouter();

  function handleStart() {
    const href = `/audits/new?repo=${encodeURIComponent(sample.repoUrl)}`;
    router.push(href);
  }

  const thumbnailAlt = tf('samples.card.thumbnailAlt', { name: sample.name });
  const tagColor = TAG_TOKEN[sample.tag];

  return (
    <Card
      variant="default"
      padding="lg"
      as="article"
      className="flex h-full flex-col gap-4"
      aria-labelledby={`sample-${sample.id}-title`}
    >
      <CardBody className="flex flex-1 flex-col gap-4">
        <div
          role="img"
          aria-label={thumbnailAlt}
          className="flex h-32 items-center justify-center rounded-[12px] border border-[color:var(--app-border)] bg-[color:var(--app-chip-bg)]"
        >
          <Github
            aria-hidden="true"
            className="h-12 w-12 text-[color:var(--app-fg-muted)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium"
            style={{
              color: tagColor,
              background: `color-mix(in oklch, ${tagColor} 12%, transparent)`,
              border: `1px solid color-mix(in oklch, ${tagColor} 28%, transparent)`,
            }}
          >
            {t(TAG_LABEL_KEY[sample.tag])}
          </span>
        </div>

        <h3
          id={`sample-${sample.id}-title`}
          className="text-lg font-semibold text-[color:var(--app-fg)]"
        >
          {sample.name}
        </h3>

        <p className="flex-1 text-sm leading-relaxed text-[color:var(--app-fg-muted)]">
          {sample.description}
        </p>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[color:var(--app-fg-muted)]">
            {t('samples.expected.label')}
          </span>
          <LaunchStatusChip status={sample.expectedStatus} />
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleStart}
          trailingIcon={<ArrowRight className="h-4 w-4" />}
          fullWidth
          aria-label={`${sample.name} ${t('samples.cta')}`}
        >
          {t('samples.cta')}
        </Button>
      </CardBody>
    </Card>
  );
}
