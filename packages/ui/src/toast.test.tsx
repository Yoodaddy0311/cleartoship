import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Toast, ToastProvider } from './toast';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'toast.tsx'), 'utf8');

describe('Toast', () => {
  it('exports Toast and ToastProvider', () => {
    expect(typeof Toast).toBe('function');
    expect(typeof ToastProvider).toBe('function');
  });

  it('uses --app-* and --sev-* tokens only (no legacy nebula/plasma/color-bg)', () => {
    expect(source).toContain('--app-surface');
    expect(source).toContain('--app-border');
    expect(source).toContain('--sev-p0');
    expect(source).not.toMatch(/color-nebula-blue|color-plasma-cyan|color-bg-elevated|aurora-violet/);
  });
});
