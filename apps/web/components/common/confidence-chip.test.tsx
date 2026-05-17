// ConfidenceChip tests — sibling-located on purpose.
// Covers Korean labels, showLabel toggle, aria-label correctness,
// dot aria-hidden, and color-token styling per FindingConfidence value.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

const { ConfidenceChip } = await import('./confidence-chip.js');

describe('ConfidenceChip', () => {
  describe('label rendering (showLabel default true)', () => {
    it('renders "신뢰도 높음" text for high confidence', () => {
      render(<ConfidenceChip confidence="high" />);
      expect(screen.getByText('신뢰도 높음')).toBeInTheDocument();
    });

    it('renders "신뢰도 보통" text for medium confidence', () => {
      render(<ConfidenceChip confidence="medium" />);
      expect(screen.getByText('신뢰도 보통')).toBeInTheDocument();
    });

    it('renders "신뢰도 낮음" text for low confidence', () => {
      render(<ConfidenceChip confidence="low" />);
      expect(screen.getByText('신뢰도 낮음')).toBeInTheDocument();
    });
  });

  describe('showLabel=false — compact mode', () => {
    it('renders just the KO label (no "신뢰도 " prefix) when showLabel=false', () => {
      render(<ConfidenceChip confidence="high" showLabel={false} />);
      expect(screen.queryByText('신뢰도 높음')).not.toBeInTheDocument();
      expect(screen.getByText('높음')).toBeInTheDocument();
    });

    it('still exposes the full aria-label "신뢰도: {label}" when showLabel=false', () => {
      render(<ConfidenceChip confidence="medium" showLabel={false} />);
      const chip = screen.getByLabelText('신뢰도: 보통');
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveAttribute('data-confidence', 'medium');
    });
  });

  describe('aria-label correctness', () => {
    it('exposes aria-label="신뢰도: 높음" for high', () => {
      render(<ConfidenceChip confidence="high" />);
      expect(screen.getByLabelText('신뢰도: 높음')).toBeInTheDocument();
    });

    it('exposes aria-label="신뢰도: 보통" for medium', () => {
      render(<ConfidenceChip confidence="medium" />);
      expect(screen.getByLabelText('신뢰도: 보통')).toBeInTheDocument();
    });

    it('exposes aria-label="신뢰도: 낮음" for low', () => {
      render(<ConfidenceChip confidence="low" />);
      expect(screen.getByLabelText('신뢰도: 낮음')).toBeInTheDocument();
    });
  });

  describe('color token application (data-confidence + inline style)', () => {
    it('sets data-confidence="high" and applies var(--sev-p3) color', () => {
      render(<ConfidenceChip confidence="high" />);
      const chip = screen.getByLabelText('신뢰도: 높음');
      expect(chip).toHaveAttribute('data-confidence', 'high');
      expect(chip.style.color).toContain('--sev-p3');
    });

    it('sets data-confidence="medium" and applies var(--sev-p2) color', () => {
      render(<ConfidenceChip confidence="medium" />);
      const chip = screen.getByLabelText('신뢰도: 보통');
      expect(chip).toHaveAttribute('data-confidence', 'medium');
      expect(chip.style.color).toContain('--sev-p2');
    });

    it('sets data-confidence="low" and applies var(--app-fg-muted) color', () => {
      render(<ConfidenceChip confidence="low" />);
      const chip = screen.getByLabelText('신뢰도: 낮음');
      expect(chip).toHaveAttribute('data-confidence', 'low');
      expect(chip.style.color).toContain('--app-fg-muted');
    });
  });

  describe('decorative dot accessibility', () => {
    it('marks the leading dot span as aria-hidden so SR skips it', () => {
      const { container } = render(<ConfidenceChip confidence="high" />);
      const dot = container.querySelector('span[aria-hidden="true"]');
      expect(dot).not.toBeNull();
      expect(dot).toHaveClass('rounded-full');
    });
  });
});
