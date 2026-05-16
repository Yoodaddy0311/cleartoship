import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScoreRing } from './score-ring';

describe('ScoreRing', () => {
  it('renders as role=img with a localized aria-label', () => {
    const html = renderToStaticMarkup(<ScoreRing score={87} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="점수 87점, 100점 만점"');
  });

  it('uses --sev-* token for stroke (no plasma-cyan/aurora hex)', () => {
    const html = renderToStaticMarkup(<ScoreRing score={20} />);
    expect(html).toContain('--sev-p0');
    expect(html).not.toMatch(/#06B6D4|#7C3AED|#EC4899|plasma-cyan/);
  });
});
