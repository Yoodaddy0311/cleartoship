// HomePage marketing surface tests — sibling-located on purpose.
// The marketing landing composes 4 sections (Hero, Trust, Features, CTA) wired
// via i18n keys. We mock the section components to keep the test focused on
// composition + the i18n-driven Trust strip a11y label.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/marketing/Hero', () => ({
  Hero: () => <div data-testid="hero" />,
}));

vi.mock('@/components/marketing/FeatureCard', () => ({
  FeatureCard: ({ title }: { title: string }) => (
    <div data-testid="feature-card">{title}</div>
  ),
}));

vi.mock('@/components/marketing/HowItWorks', () => ({
  HowItWorks: () => <div data-testid="how" />,
}));

vi.mock('@/components/marketing/CTABanner', () => ({
  CTABanner: () => <div data-testid="cta" />,
}));

vi.mock('@/lib/i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('lucide-react', () => ({
  Gauge: () => null,
  FileSearch: () => null,
  FileCode2: () => null,
}));

const { default: HomePage } = await import('./page.js');

describe('HomePage', () => {
  it('renders all four marketing sections', () => {
    render(<HomePage />);
    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(screen.getByTestId('how')).toBeInTheDocument();
    expect(screen.getByTestId('cta')).toBeInTheDocument();
  });

  it('renders three FeatureCard entries (f1/f2/f3)', () => {
    render(<HomePage />);
    const cards = screen.getAllByTestId('feature-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent('mk.features.f1.title');
    expect(cards[1]).toHaveTextContent('mk.features.f2.title');
    expect(cards[2]).toHaveTextContent('mk.features.f3.title');
  });

  it('renders a Trust strip with an a11y label and 6 logos', () => {
    render(<HomePage />);
    const strip = screen.getByLabelText('mk.trust.title');
    expect(strip.tagName).toBe('SECTION');
    expect(strip.querySelectorAll('li')).toHaveLength(6);
  });
});
