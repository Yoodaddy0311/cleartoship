import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Hero } from './Hero';

describe('Hero', () => {
  it('renders the hero headline as h1', () => {
    render(<Hero />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toMatch(/5초/);
  });

  it('exposes primary and secondary CTAs with provided hrefs', () => {
    render(<Hero primaryHref="/start" secondaryHref="/demo" />);
    const links = screen.getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/start');
    expect(hrefs).toContain('/demo');
  });
});
