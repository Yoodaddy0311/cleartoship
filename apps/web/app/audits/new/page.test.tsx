import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/audit-start/url-input-form', () => ({
  UrlInputForm: () => <div data-stub="url-input-form" />,
}));

describe('AuditNewPage', () => {
  it('exports a default React component function', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });

  it('renders the hero heading and mounts the UrlInputForm', async () => {
    const { default: AuditNewPage } = await import('./page');
    render(<AuditNewPage />);

    expect(
      screen.getByRole('heading', { name: /출시해도 되는 코드인지/, level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByText(/GitHub Repo와 배포 URL/)).toBeInTheDocument();
    expect(document.querySelector('[data-stub="url-input-form"]')).toBeTruthy();
  });

  it('exports metadata with localized title', async () => {
    const mod = await import('./page');
    expect(mod.metadata?.title).toBeTruthy();
    expect(typeof mod.metadata?.title).toBe('string');
  });
});
