import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CTABanner } from './CTABanner';

describe('CTABanner', () => {
  it('renders headline as h2 with section label', () => {
    render(<CTABanner />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toBeInTheDocument();
    expect(heading.id).toBe('mk-cta-title');
  });

  it('uses provided href for the CTA link', () => {
    render(<CTABanner href="/signup" />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/signup');
  });
});
