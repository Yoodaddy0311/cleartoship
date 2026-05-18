/// <reference types="@testing-library/jest-dom" />
// L-P1-1: ProfileBadge — snapshot/visibility coverage across 4 known profiles
// + the null (no-badge) case. The component is intentionally inert: it has no
// state, no events, and no async work — so the contract is "for each profile
// id, render a chip with the i18n full label as aria-label; for null, render
// nothing." Tests assert exactly that.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileBadge } from './profile-badge';
import { t } from '@/lib/i18n';

describe('ProfileBadge — L-P1-1', () => {
  describe('renders a chip for each known profile id', () => {
    it('landing — aria-label uses the i18n landing option label', () => {
      render(<ProfileBadge profileId="landing" />);
      const chip = screen.getByRole('status');
      expect(chip).toHaveAttribute('data-profile', 'landing');
      expect(chip).toHaveAttribute(
        'aria-label',
        t('home.form.profile.option.landing')
      );
      expect(chip.textContent).toMatch(/랜딩/);
    });

    it('saas — aria-label uses the i18n saas option label', () => {
      render(<ProfileBadge profileId="saas" />);
      const chip = screen.getByRole('status');
      expect(chip).toHaveAttribute('data-profile', 'saas');
      expect(chip).toHaveAttribute(
        'aria-label',
        t('home.form.profile.option.saas')
      );
      expect(chip.textContent).toMatch(/SaaS/);
    });

    it('ecommerce — aria-label uses the i18n ecommerce option label', () => {
      render(<ProfileBadge profileId="ecommerce" />);
      const chip = screen.getByRole('status');
      expect(chip).toHaveAttribute('data-profile', 'ecommerce');
      expect(chip).toHaveAttribute(
        'aria-label',
        t('home.form.profile.option.ecommerce')
      );
      expect(chip.textContent).toMatch(/이커머스/);
    });

    it('vibe-coded — aria-label uses the new i18n vibeCoded option label', () => {
      render(<ProfileBadge profileId="vibe-coded" />);
      const chip = screen.getByRole('status');
      expect(chip).toHaveAttribute('data-profile', 'vibe-coded');
      expect(chip).toHaveAttribute(
        'aria-label',
        t('home.form.profile.option.vibeCoded')
      );
      expect(chip.textContent).toMatch(/바이브/);
    });
  });

  it('renders nothing for the null (default no-bias) case', () => {
    const { container } = render(<ProfileBadge profileId={null} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders nothing for an unknown profile id (forward-compat guard)', () => {
    // audit-core treats unknown ids as no-bias; the badge should follow suit
    // rather than rendering an untranslated label or "[object Object]".
    const { container } = render(<ProfileBadge profileId="future-profile" />);
    expect(container.firstChild).toBeNull();
  });
});
