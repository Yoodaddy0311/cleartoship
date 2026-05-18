/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SpecialText } from './special-text';

describe('SpecialText', () => {
  it('renders a span with aria-label equal to the final text for screen readers', () => {
    const { container } = render(<SpecialText>ClearToShip</SpecialText>);
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span?.getAttribute('aria-label')).toBe('ClearToShip');
  });

  it('starts with a same-length placeholder so layout does not shift on mount', () => {
    const { container } = render(<SpecialText>ClearToShip</SpecialText>);
    const text = container.querySelector('span')?.textContent ?? '';
    expect(text.length).toBe('ClearToShip'.length);
    // The initial frame is the placeholder phase — no real brand letters yet.
    expect(text).not.toContain('C');
    expect(text).not.toContain('p');
  });

  it('applies the provided className alongside the base typography classes', () => {
    const { container } = render(
      <SpecialText className="text-4xl text-mk-accent">ClearToShip</SpecialText>,
    );
    const span = container.querySelector('span');
    expect(span?.className).toContain('font-mono');
    expect(span?.className).toContain('text-4xl');
    expect(span?.className).toContain('text-mk-accent');
  });
});
