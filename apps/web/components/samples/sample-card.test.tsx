// Behavioural tests for <SampleCard />.
//
// Covers:
//   1. renders sample name, description, expected status chip, and CTA
//   2. click → router.push to /audits/new?repo=<encoded-url>
//   3. CTA exposes a sample-name aria-label for screen readers
//   4. thumbnail role + aria-label resolves the interpolated repo name

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SampleCard } from './sample-card';
import type { SampleRepo } from '@/lib/sample-repos';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const SAMPLE: SampleRepo = {
  id: 'sample-x',
  name: 'octocat/Sample-X',
  description: '설명 텍스트 — 테스트용 샘플.',
  repoUrl: 'https://github.com/octocat/Sample-X',
  expectedStatus: 'ready',
  tag: 'benchmark',
};

describe('SampleCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the sample name, description, and expected-status chip', () => {
    render(<SampleCard sample={SAMPLE} />);

    expect(screen.getByText('octocat/Sample-X')).toBeInTheDocument();
    expect(screen.getByText('설명 텍스트 — 테스트용 샘플.')).toBeInTheDocument();
    // LaunchStatusChip for `ready` resolves to '출시 가능'
    expect(screen.getByText('출시 가능')).toBeInTheDocument();
  });

  it('navigates to /audits/new with the repo URL prefill on CTA click', async () => {
    const user = userEvent.setup();
    render(<SampleCard sample={SAMPLE} />);

    await user.click(
      screen.getByRole('button', { name: /octocat\/Sample-X/ })
    );

    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith(
      `/audits/new?repo=${encodeURIComponent(SAMPLE.repoUrl)}`
    );
  });

  it('exposes the sample name in the CTA aria-label for screen readers', () => {
    render(<SampleCard sample={SAMPLE} />);
    const cta = screen.getByRole('button', { name: /octocat\/Sample-X/ });
    // aria-label combines `${name} ${cta-text}` so the SR-user understands
    // *which* sample they are about to audit when multiple cards are visible.
    expect(cta).toHaveAttribute(
      'aria-label',
      'octocat/Sample-X 이 저장소로 감사 시작'
    );
  });

  it('renders the thumbnail with role=img and an interpolated aria-label', () => {
    render(<SampleCard sample={SAMPLE} />);
    const thumb = screen.getByRole('img', {
      name: 'octocat/Sample-X 저장소 미리보기',
    });
    expect(thumb).toBeInTheDocument();
  });

  it('uses the article landmark with aria-labelledby pointing at the title', () => {
    render(<SampleCard sample={SAMPLE} />);
    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('aria-labelledby', 'sample-sample-x-title');
    expect(screen.getByText('octocat/Sample-X').id).toBe(
      'sample-sample-x-title'
    );
  });

  it('renders the indeterminate launch-status chip for minimal-repo samples', () => {
    const indeterminate: SampleRepo = {
      ...SAMPLE,
      id: 'tiny',
      expectedStatus: 'indeterminate',
      tag: 'minimal',
    };
    render(<SampleCard sample={indeterminate} />);
    expect(screen.getByText('판단 불가 (분석 자료 부족)')).toBeInTheDocument();
  });
});
