/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FindingCard } from './finding-card';

// ui 패키지는 audit-core(business logic)에 의존하지 않는다 — 라벨은 prop
// 주입으로 받는다. 호스트 앱(apps/web)에서 SEVERITY_LANGUAGE_KO/EN 을 prop
// 으로 넘기는 것이 SSOT 통합 지점. 여기 테스트는 default fallback + override
// 두 경로만 가드한다.
const KO_LABELS = {
  P0: '출시 차단',
  P1: '강력 권장',
  P2: '개선 권장',
  P3: '장기 개선',
} as const;

const EN_LABELS = {
  P0: 'Launch Blocker',
  P1: 'Strongly Recommended',
  P2: 'Recommended Improvement',
  P3: 'Long-term Polish',
} as const;

describe('FindingCard', () => {
  it('renders title, ruleId, file:line, and category', () => {
    render(
      <FindingCard
        severity="P1"
        title="Hardcoded secret detected"
        ruleId="secrets.hardcoded-token"
        filePath="src/config.ts"
        line={42}
        category="Security"
      />
    );

    expect(screen.getByText('Hardcoded secret detected')).toBeInTheDocument();
    expect(screen.getByText('secrets.hardcoded-token')).toBeInTheDocument();
    expect(screen.getByText('src/config.ts:42')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
  });

  it('invokes action callbacks when their buttons are clicked', () => {
    const onView = vi.fn();
    const onConfirm = vi.fn();
    const onDismiss = vi.fn();

    render(
      <FindingCard
        severity="P0"
        title="t"
        ruleId="r"
        filePath="f"
        line={1}
        category="c"
        onView={onView}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onView).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('exposes severity via data-severity attribute', () => {
    const { container } = render(
      <FindingCard
        severity="P2"
        title="t"
        ruleId="r"
        filePath="f"
        line={1}
        category="c"
      />
    );
    const article = container.querySelector('article');
    expect(article?.getAttribute('data-severity')).toBe('P2');
  });

  // T2.11 #122: 모바일 폴리시 가드 — 단축 라벨 + sr-only 풀라벨 동시 노출.
  // 풀라벨은 default fallback(한국어)로 렌더된다.
  it('exposes both short visual severity label and full sr-only label (Korean default)', () => {
    render(
      <FindingCard
        severity="P1"
        title="t"
        ruleId="r"
        filePath="f"
        line={1}
        category="c"
      />
    );
    const chip = screen.getByTestId('finding-card-severity');
    expect(chip).toHaveTextContent('P1');
    expect(chip).toHaveTextContent(`P1 · ${KO_LABELS.P1}`);
  });

  it('applies mobile-line-clamp-3 to long excerpts (mobile only branch)', () => {
    const longExcerpt =
      '비개발자에게도 분명히 보이는 한국어 설명을 길게 적어 모바일 화면에서 ' +
      '한 줄로 잘려 의미가 사라지지 않도록 3줄 clamp가 작동하는지 확인한다.';
    const { container } = render(
      <FindingCard
        severity="P2"
        title="t"
        ruleId="r"
        filePath="f"
        line={1}
        category="c"
        excerpt={longExcerpt}
      />
    );
    const clampNode = container.querySelector('.mobile-line-clamp-3');
    expect(clampNode).not.toBeNull();
    expect(clampNode?.textContent).toBe(longExcerpt);
  });

  it('action buttons satisfy 44px touch target on mobile (h-10 baseline)', () => {
    render(
      <FindingCard
        severity="P0"
        title="t"
        ruleId="r"
        filePath="f"
        line={1}
        category="c"
        onView={() => {}}
        onConfirm={() => {}}
        onDismiss={() => {}}
      />
    );
    for (const name of ['View', 'Confirm', 'Dismiss']) {
      const btn = screen.getByRole('button', { name });
      expect(btn.className).toMatch(/h-10/);
      expect(btn.className).toMatch(/touch-target/);
    }
  });

  it('exposes WCAG-compliant focus-visible outline on every action button', () => {
    render(
      <FindingCard
        severity="P0"
        title="t"
        ruleId="r"
        filePath="f"
        line={1}
        category="c"
        onView={() => {}}
        onConfirm={() => {}}
        onDismiss={() => {}}
      />
    );
    for (const name of ['View', 'Confirm', 'Dismiss']) {
      const btn = screen.getByRole('button', { name });
      expect(btn.className).toMatch(/focus-visible:outline-2/);
      expect(btn.className).toMatch(/focus-visible:outline-\[color:var\(--mk-accent\)\]/);
    }
  });

  // default 한국어 fallback 이 4개 severity 전부에 대해 노출되는지 가드.
  it.each(['P0', 'P1', 'P2', 'P3'] as const)(
    'renders default Korean label for severity %s when severityLabels is omitted',
    (sev) => {
      render(
        <FindingCard
          severity={sev}
          title="t"
          ruleId="r"
          filePath="f"
          line={1}
          category="c"
        />
      );
      const chip = screen.getByTestId('finding-card-severity');
      expect(chip).toHaveTextContent(`${sev} · ${KO_LABELS[sev]}`);
    }
  );

  // prop 주입(예: 영문 라벨)이 fallback을 override 하는지 가드.
  it('renders injected severityLabels override (English example)', () => {
    render(
      <FindingCard
        severity="P0"
        title="t"
        ruleId="r"
        filePath="f"
        line={1}
        category="c"
        severityLabels={EN_LABELS}
      />
    );
    const chip = screen.getByTestId('finding-card-severity');
    expect(chip).toHaveTextContent(`P0 · ${EN_LABELS.P0}`);
    expect(chip).not.toHaveTextContent(KO_LABELS.P0);
  });
});
