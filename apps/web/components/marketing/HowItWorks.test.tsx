import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HowItWorks } from './HowItWorks';

describe('HowItWorks', () => {
  it('renders three numbered steps', () => {
    const { container } = render(<HowItWorks />);
    const list = container.querySelector('ol');
    expect(list).not.toBeNull();
    expect(list?.children.length).toBe(3);
  });

  it('marks step numbers as decorative (aria-hidden)', () => {
    const { container } = render(<HowItWorks />);
    const hidden = container.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBeGreaterThanOrEqual(3);
  });

  it('renders the section heading', () => {
    render(<HowItWorks />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });
});
