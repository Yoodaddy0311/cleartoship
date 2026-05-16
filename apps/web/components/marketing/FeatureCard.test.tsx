import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShieldCheck } from 'lucide-react';
import { FeatureCard } from './FeatureCard';

describe('FeatureCard', () => {
  it('renders title and description', () => {
    render(
      <FeatureCard
        icon={ShieldCheck}
        title="Evidence-based"
        description="Every finding cites file:line."
      />
    );
    expect(screen.getByRole('heading', { name: 'Evidence-based' })).toBeInTheDocument();
    expect(screen.getByText('Every finding cites file:line.')).toBeInTheDocument();
  });

  it('renders an icon marked aria-hidden', () => {
    const { container } = render(
      <FeatureCard
        icon={ShieldCheck}
        title="t"
        description="d"
      />
    );
    const svg = container.querySelector('svg[aria-hidden="true"]');
    expect(svg).not.toBeNull();
  });
});
