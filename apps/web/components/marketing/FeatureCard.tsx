import type { LucideIcon } from 'lucide-react';

export interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <article className="flex h-full flex-col rounded-mk border border-app-border bg-mk-bg p-7 shadow-mk transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-mk bg-mk-bg-soft text-mk-accent">
        <Icon className="h-8 w-8" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-mk-fg">{title}</h3>
      <p className="mt-3 text-base leading-relaxed text-mk-fg-muted">{description}</p>
    </article>
  );
}
