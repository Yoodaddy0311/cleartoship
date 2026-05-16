/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterChips } from './filter-chips';

const chips = [
  { value: 'p0', label: 'P0', count: 3 },
  { value: 'p1', label: 'P1', count: 5 },
];

describe('FilterChips', () => {
  it('renders one chip per item with labels and counts', () => {
    render(<FilterChips chips={chips} selected={[]} onChange={() => {}} />);
    expect(screen.getByRole('checkbox', { name: /P0/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /P1/ })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('toggles selection via onChange when multiple=true', () => {
    const onChange = vi.fn();
    render(
      <FilterChips chips={chips} selected={['p0']} onChange={onChange} multiple />
    );

    const p1 = screen.getByRole('checkbox', { name: /P1/ });
    expect(p1).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(p1);
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(['p0', 'p1']));
  });

  it('behaves as a radio group when multiple=false', () => {
    const onChange = vi.fn();
    render(
      <FilterChips
        chips={chips}
        selected={['p0']}
        onChange={onChange}
        multiple={false}
      />
    );

    const p1 = screen.getByRole('radio', { name: /P1/ });
    fireEvent.click(p1);
    expect(onChange).toHaveBeenCalledWith(['p1']);
  });

  it('exposes WCAG-compliant focus-visible outline on both selected and unselected chips', () => {
    render(
      <FilterChips chips={chips} selected={['p0']} onChange={() => {}} multiple />
    );
    const selectedChip = screen.getByRole('checkbox', { name: /P0/ });
    const unselectedChip = screen.getByRole('checkbox', { name: /P1/ });
    for (const btn of [selectedChip, unselectedChip]) {
      expect(btn.className).toMatch(/focus-visible:outline-2/);
      expect(btn.className).toMatch(/focus-visible:outline-offset-2/);
      expect(btn.className).toMatch(/focus-visible:outline-\[color:var\(--mk-accent\)\]/);
    }
  });
});
