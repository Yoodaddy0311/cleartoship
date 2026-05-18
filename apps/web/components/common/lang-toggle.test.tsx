// Sprint 4 L-P1-5 — <LangToggle /> behavioural tests.
//
// Mocks:
//  - `next/navigation` → spy `router.refresh`
//  - `@/app/actions/revalidate-lang` → spy `revalidateLang`
//  - `@cleartoship/ui` → identity `cn` so class strings are inspectable

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const refreshMock = vi.fn();
const revalidateLangMock = vi.fn(async (_locale: 'ko' | 'en') => {});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock('@/app/actions/revalidate-lang', () => ({
  revalidateLang: (locale: 'ko' | 'en') => revalidateLangMock(locale),
}));

vi.mock('@cleartoship/ui', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

const { LangToggle } = await import('./lang-toggle.js');

beforeEach(() => {
  refreshMock.mockReset();
  revalidateLangMock.mockReset();
  revalidateLangMock.mockResolvedValue(undefined);
});

describe('LangToggle', () => {
  it('renders KO active and EN inactive when initialLocale is ko', () => {
    render(<LangToggle initialLocale="ko" />);
    const ko = screen.getByTestId('lang-toggle-ko');
    const en = screen.getByTestId('lang-toggle-en');
    expect(ko).toHaveAttribute('aria-pressed', 'true');
    expect(en).toHaveAttribute('aria-pressed', 'false');
    expect(ko).toHaveAttribute('aria-current', 'true');
    expect(en).not.toHaveAttribute('aria-current');
  });

  it('calls revalidateLang(en) and router.refresh on EN click', async () => {
    const user = userEvent.setup();
    render(<LangToggle initialLocale="ko" />);
    await user.click(screen.getByTestId('lang-toggle-en'));
    await waitFor(() => {
      expect(revalidateLangMock).toHaveBeenCalledWith('en');
    });
    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it('flips aria-pressed to reflect the optimistic selection', async () => {
    const user = userEvent.setup();
    render(<LangToggle initialLocale="ko" />);
    const en = screen.getByTestId('lang-toggle-en');
    await user.click(en);
    await waitFor(() => {
      expect(en).toHaveAttribute('aria-pressed', 'true');
    });
    expect(screen.getByTestId('lang-toggle-ko')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('is a no-op when the user clicks the already-active button', async () => {
    const user = userEvent.setup();
    render(<LangToggle initialLocale="ko" />);
    await user.click(screen.getByTestId('lang-toggle-ko'));
    expect(revalidateLangMock).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('exposes group role + aria-label for assistive tech', () => {
    render(<LangToggle initialLocale="en" />);
    const group = screen.getByTestId('lang-toggle');
    expect(group).toHaveAttribute('role', 'group');
    expect(group).toHaveAttribute('aria-label', 'Language');
  });
});
