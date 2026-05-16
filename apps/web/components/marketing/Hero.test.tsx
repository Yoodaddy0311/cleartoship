// Hero marketing section tests — structural assertions are decoupled from i18n
// copy via `data-testid` selectors. A single dedicated smoke test guards the
// i18n wiring so translation churn touches one assertion at most.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from './Hero';
import { t } from '@/lib/i18n';

describe('Hero (structure, i18n-agnostic)', () => {
  it('renders the headline as the page-level h1', () => {
    render(<Hero />);
    const headline = screen.getByTestId('hero-headline');
    expect(headline).toBeInTheDocument();
    expect(headline.tagName).toBe('H1');
  });

  it('renders the gradient accent span inside the headline', () => {
    render(<Hero />);
    const headline = screen.getByTestId('hero-headline');
    const accent = screen.getByTestId('hero-headline-accent');
    expect(headline).toContainElement(accent);
  });

  it('renders the eyebrow and subtitle slots', () => {
    render(<Hero />);
    expect(screen.getByTestId('hero-eyebrow')).toBeInTheDocument();
    expect(screen.getByTestId('hero-subtitle')).toBeInTheDocument();
  });

  it('exposes primary and secondary CTAs with default hrefs', () => {
    render(<Hero />);
    expect(screen.getByTestId('hero-cta-primary')).toHaveAttribute(
      'href',
      '/audits/new'
    );
    expect(screen.getByTestId('hero-cta-secondary')).toHaveAttribute(
      'href',
      '/audits/demo'
    );
  });

  it('honors custom hrefs passed as props', () => {
    render(<Hero primaryHref="/start" secondaryHref="/demo" />);
    expect(screen.getByTestId('hero-cta-primary')).toHaveAttribute(
      'href',
      '/start'
    );
    expect(screen.getByTestId('hero-cta-secondary')).toHaveAttribute(
      'href',
      '/demo'
    );
  });

  it('labels the section via aria-labelledby pointing to the headline id', () => {
    render(<Hero />);
    const section = screen.getByTestId('hero-section');
    expect(section).toHaveAttribute('aria-labelledby', 'mk-hero-title');
    expect(screen.getByTestId('hero-headline')).toHaveAttribute(
      'id',
      'mk-hero-title'
    );
  });
});

describe('Hero (i18n smoke)', () => {
  // Single guard against accidental i18n wiring breakage. If the keys change,
  // this is the only test that needs updating — structural tests above remain
  // stable.
  it('wires every translatable slot to its i18n key', () => {
    render(<Hero />);
    expect(screen.getByTestId('hero-eyebrow')).toHaveTextContent(
      t('mk.hero.eyebrow')
    );
    expect(screen.getByTestId('hero-headline-accent')).toHaveTextContent(
      t('mk.hero.title.accent')
    );
    expect(screen.getByTestId('hero-subtitle')).toHaveTextContent(
      t('mk.hero.subtitle')
    );
    expect(screen.getByTestId('hero-cta-primary')).toHaveTextContent(
      t('mk.hero.cta.primary')
    );
    expect(screen.getByTestId('hero-cta-secondary')).toHaveTextContent(
      t('mk.hero.cta.secondary')
    );
  });
});
