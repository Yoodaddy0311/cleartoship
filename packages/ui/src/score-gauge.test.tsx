import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScoreGauge } from './score-gauge';

describe('ScoreGauge', () => {
  it('renders progressbar with aria-valuenow clamped', () => {
    const html = renderToStaticMarkup(<ScoreGauge score={-10} label="UX" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain('aria-label="UX 점수 0"');
  });

  it('uses --sev-* and --app-* tokens (no legacy color-severity/color-bg-elevated)', () => {
    const html = renderToStaticMarkup(<ScoreGauge score={90} label="Sec" />);
    expect(html).toContain('--sev-p3');
    expect(html).toContain('--app-surface');
    expect(html).not.toMatch(/color-severity-p|color-bg-elevated|aurora/);
  });
});
