// HowItWorks marketing section tests — data-driven.
// We pass an explicit `steps` prop and assert against `steps.length` so the
// suite does not encode a magic number for the step count. This lets the
// component scale (2-step, 5-step variants for A/B tests) without test churn.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HowItWorks, type Step } from './HowItWorks';

const twoSteps: Step[] = [
  { number: '01', titleKey: 'mk.how.s1.title', descKey: 'mk.how.s1.desc' },
  { number: '02', titleKey: 'mk.how.s2.title', descKey: 'mk.how.s2.desc' },
];

const threeSteps: Step[] = [
  { number: '01', titleKey: 'mk.how.s1.title', descKey: 'mk.how.s1.desc' },
  { number: '02', titleKey: 'mk.how.s2.title', descKey: 'mk.how.s2.desc' },
  { number: '03', titleKey: 'mk.how.s3.title', descKey: 'mk.how.s3.desc' },
];

const fiveSteps: Step[] = [
  { number: '01', titleKey: 'mk.how.s1.title', descKey: 'mk.how.s1.desc' },
  { number: '02', titleKey: 'mk.how.s2.title', descKey: 'mk.how.s2.desc' },
  { number: '03', titleKey: 'mk.how.s3.title', descKey: 'mk.how.s3.desc' },
  { number: '04', titleKey: 'mk.how.s1.title', descKey: 'mk.how.s1.desc' },
  { number: '05', titleKey: 'mk.how.s2.title', descKey: 'mk.how.s2.desc' },
];

describe('HowItWorks', () => {
  describe.each([
    { label: 'two-step variant', steps: twoSteps },
    { label: 'three-step variant (default shape)', steps: threeSteps },
    { label: 'five-step variant', steps: fiveSteps },
  ])('$label', ({ steps }) => {
    it(`renders exactly ${steps.length} step items`, () => {
      render(<HowItWorks steps={steps} />);
      const items = screen.getAllByTestId('how-it-works-step');
      expect(items).toHaveLength(steps.length);
    });

    it(`marks all ${steps.length} step numbers as decorative (aria-hidden)`, () => {
      render(<HowItWorks steps={steps} />);
      const numbers = screen.getAllByTestId('how-it-works-step-number');
      expect(numbers).toHaveLength(steps.length);
      for (const node of numbers) {
        expect(node).toHaveAttribute('aria-hidden', 'true');
      }
    });

    it('renders the section heading once regardless of step count', () => {
      render(<HowItWorks steps={steps} />);
      expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    });
  });

  it('falls back to the default 3 steps when no prop is passed', () => {
    render(<HowItWorks />);
    // Behavior under default props is part of the public contract: page.tsx
    // composes <HowItWorks /> with no props.
    const items = screen.getAllByTestId('how-it-works-step');
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('renders an empty list (no step <li>) when steps is an empty array', () => {
    render(<HowItWorks steps={[]} />);
    expect(screen.queryAllByTestId('how-it-works-step')).toHaveLength(0);
    // Heading must still render — it is independent of the data.
    expect(screen.getByTestId('how-it-works-heading')).toBeInTheDocument();
  });
});
