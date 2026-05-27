// LaunchVerdictChip tests — sibling-located on purpose, mirrors
// strengths-panel.test.tsx. Uses the real `@cleartoship/shared-types` exports
// (verdict labels/tone) so the test guards against label drift; only the
// presentational `@cleartoship/ui` Card shell is stubbed.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { LaunchGateResult } from '@cleartoship/shared-types';

vi.mock('@cleartoship/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  CardBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { LaunchVerdictChip } = await import('./launch-verdict-chip.js');

// Inline fixture: a CONDITIONAL verdict mixing YES / NO / UNKNOWN so the test
// exercises all three status presentations in one render.
const FIXTURE: LaunchGateResult = {
  verdict: 'CONDITIONAL',
  rationale: '핵심 기반은 충족했으나 보안 점검을 실행하지 못했습니다.',
  questions: [
    { id: 'Q1', question: 'README와 출시 주장', answer: 'YES', evidence: ['README.md found'] },
    { id: 'Q2', question: '라이선스 파일', answer: 'YES', evidence: ['LICENSE found'] },
    { id: 'Q3', question: 'CI 설정과 테스트', answer: 'YES', evidence: ['.github/workflows/ci.yml'] },
    { id: 'Q4', question: 'P0 차단 이슈 없음', answer: 'YES', evidence: ['P0 count = 0'] },
    { id: 'Q5', question: '배포 URL 도달 가능', answer: 'NO', evidence: ['deploy URL 404'] },
    { id: 'Q6', question: '보안 점검 통과', answer: 'UNKNOWN', evidence: [] },
    { id: 'Q7', question: '비즈니스 준비도', answer: 'YES', evidence: ['BUSINESS_READINESS = 78'] },
  ],
};

describe('LaunchVerdictChip', () => {
  it('renders the verdict label from LAUNCH_VERDICT_LABELS_KO', () => {
    render(<LaunchVerdictChip launchGate={FIXTURE} />);
    expect(screen.getByTestId('launch-verdict-chip')).toHaveTextContent(
      '조건부 출시 가능'
    );
  });

  it('renders the rationale line', () => {
    render(<LaunchVerdictChip launchGate={FIXTURE} />);
    expect(
      screen.getByText(
        '핵심 기반은 충족했으나 보안 점검을 실행하지 못했습니다.'
      )
    ).toBeInTheDocument();
  });

  it('renders all seven questions with their text', () => {
    render(<LaunchVerdictChip launchGate={FIXTURE} />);
    for (const q of FIXTURE.questions) {
      expect(
        screen.getByTestId(`launch-question-${q.id}`)
      ).toHaveTextContent(q.question);
    }
  });

  it('renders an answered question with its evidence', () => {
    render(<LaunchVerdictChip launchGate={FIXTURE} />);
    const q1 = screen.getByTestId('launch-question-Q1');
    expect(q1).toHaveTextContent('README와 출시 주장');
    expect(q1).toHaveTextContent('README.md found');
  });

  it('exposes non-colour status text for each answer state', () => {
    render(<LaunchVerdictChip launchGate={FIXTURE} />);
    // YES → 충족, NO → 미충족, UNKNOWN → 미확인 (sr-only, but present in DOM).
    expect(screen.getByTestId('launch-question-Q1')).toHaveTextContent('충족');
    expect(screen.getByTestId('launch-question-Q5')).toHaveTextContent(
      '미충족'
    );
    expect(screen.getByTestId('launch-question-Q6')).toHaveTextContent(
      '미확인'
    );
  });
});
