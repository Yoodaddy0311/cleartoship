// ActionHintCell tests — covers L-P0-6 dictionary rendering, ETA ladder
// (5/30/60/240 → '5분'/'30분'/'1시간'/'반나절+'), empty placeholder, and the
// row/panel variant width hook. ko.ts strings come through the real `t()` so
// the test also guards the i18n key contract.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@cleartoship/ui', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  ExternalLink: ({ className }: { className?: string }) => (
    <svg data-testid="external-link-icon" className={className} aria-hidden="true" />
  ),
}));

const { ActionHintCell } = await import('./action-hint-cell.js');

describe('ActionHintCell', () => {
  it('renders the empty placeholder when hint is omitted', () => {
    render(<ActionHintCell />);
    const empty = screen.getByTestId('action-hint-empty');
    expect(empty).toBeInTheDocument();
    expect(empty).toHaveTextContent('액션 가이드 준비 중');
  });

  it('renders the hint text + ETA badge for a populated hint', () => {
    render(
      <ActionHintCell
        hint={{ text: '환경변수에 시크릿을 옮기세요', etaMinutes: 30 }}
      />,
    );
    expect(screen.getByTestId('action-hint')).toHaveTextContent(
      '환경변수에 시크릿을 옮기세요',
    );
    expect(screen.getByTestId('action-hint-eta')).toHaveTextContent('30분');
  });

  it.each([
    [5, '5분'],
    [30, '30분'],
    [60, '1시간'],
    [240, '반나절+'],
  ] as const)(
    'maps etaMinutes=%i to ladder label "%s"',
    (etaMinutes, expectedLabel) => {
      const { unmount } = render(
        <ActionHintCell hint={{ text: 't', etaMinutes }} />,
      );
      expect(screen.getByTestId('action-hint-eta')).toHaveTextContent(
        expectedLabel,
      );
      unmount();
    },
  );

  it('exposes the raw etaMinutes via data-eta-minutes for downstream sorting / tests', () => {
    render(
      <ActionHintCell hint={{ text: 'quick fix', etaMinutes: 5 }} />,
    );
    expect(screen.getByTestId('action-hint')).toHaveAttribute(
      'data-eta-minutes',
      '5',
    );
  });

  it('exposes an accessible label combining "예상 소요" prefix + label', () => {
    render(
      <ActionHintCell hint={{ text: 'fix', etaMinutes: 240 }} />,
    );
    expect(screen.getByTestId('action-hint-eta')).toHaveAttribute(
      'aria-label',
      '예상 소요 반나절+',
    );
  });

  it('uses larger text in panel variant than in row variant', () => {
    const { rerender, getByTestId } = render(
      <ActionHintCell hint={{ text: 'fix', etaMinutes: 60 }} />,
    );
    expect(getByTestId('action-hint').className).toMatch(/text-xs/);
    rerender(
      <ActionHintCell hint={{ text: 'fix', etaMinutes: 60 }} variant="panel" />,
    );
    expect(getByTestId('action-hint').className).toMatch(/text-sm/);
  });

  it('omits the reference link when referenceUrl is absent', () => {
    render(
      <ActionHintCell hint={{ text: 'fix', etaMinutes: 30 }} />,
    );
    expect(screen.queryByTestId('action-hint-reference')).toBeNull();
    expect(screen.queryByTestId('external-link-icon')).toBeNull();
  });

  it('renders the reference link with safe rel + a11y label when referenceUrl is present', () => {
    render(
      <ActionHintCell
        hint={{
          text: 'fix',
          etaMinutes: 30,
          referenceUrl: 'https://owasp.org/Top10/A03_Injection/',
        }}
      />,
    );
    const link = screen.getByTestId('action-hint-reference');
    expect(link).toHaveAttribute(
      'href',
      'https://owasp.org/Top10/A03_Injection/',
    );
    expect(link).toHaveAttribute('target', '_blank');
    // noopener+noreferrer required for any user-supplied target=_blank link
    // to prevent reverse tabnabbing — guards against schema-side widening of
    // referenceUrl to untrusted sources.
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('aria-label', '관련 참고 자료 새 창에서 열기');
    expect(screen.getByTestId('external-link-icon')).toBeInTheDocument();
    expect(link).toHaveTextContent('참고 자료');
  });
});
