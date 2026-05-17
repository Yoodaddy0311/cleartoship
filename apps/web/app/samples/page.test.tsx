// Behavioural tests for /samples (sample-repo gallery page).
//
// Covers:
//   1. renders the gallery heading + subtitle
//   2. renders one card per entry in SAMPLE_REPOS
//   3. the grid container uses role=list so SR-users hear "6 items"

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SamplesPage from './page';
import { SAMPLE_REPOS } from '@/lib/sample-repos';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('SamplesPage', () => {
  it('renders the gallery heading and subtitle', () => {
    render(<SamplesPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: '샘플 Repo 갤러리' })
    ).toBeInTheDocument();
    // Subtitle leads with '실제 오픈소스' — match a stable prefix.
    expect(screen.getByText(/실제 오픈소스 저장소로/)).toBeInTheDocument();
  });

  it('renders one list item per SAMPLE_REPOS entry', () => {
    render(<SamplesPage />);
    const list = screen.getByRole('list');
    expect(list).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(SAMPLE_REPOS.length);
  });

  it('renders every sample name from the catalog', () => {
    render(<SamplesPage />);
    for (const sample of SAMPLE_REPOS) {
      expect(screen.getByText(sample.name)).toBeInTheDocument();
    }
  });

  it('exposes one article landmark per sample for SR navigation', () => {
    render(<SamplesPage />);
    expect(screen.getAllByRole('article')).toHaveLength(SAMPLE_REPOS.length);
  });
});
