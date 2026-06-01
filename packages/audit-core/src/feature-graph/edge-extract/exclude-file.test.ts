import { describe, it, expect } from 'vitest';
import { isExcludedFile } from './exclude-file.js';

describe('isExcludedFile', () => {
  it('excludes test files (*.test.* / *.spec.*)', () => {
    expect(isExcludedFile('src/narrative.test.ts')).toBe(true);
    expect(isExcludedFile('app/foo/bar.spec.tsx')).toBe(true);
    expect(isExcludedFile('components/Button.test.jsx')).toBe(true);
  });

  it('excludes storybook + type-declaration + config files', () => {
    expect(isExcludedFile('components/Button.stories.tsx')).toBe(true);
    expect(isExcludedFile('types/global.d.ts')).toBe(true);
    expect(isExcludedFile('next.config.js')).toBe(true);
    expect(isExcludedFile('vitest.config.ts')).toBe(true);
    expect(isExcludedFile('tailwind.config.ts')).toBe(true);
  });

  it('excludes paths under known infra/test dirs', () => {
    expect(isExcludedFile('__tests__/helpers.ts')).toBe(true);
    expect(isExcludedFile('src/__mocks__/db.ts')).toBe(true);
    expect(isExcludedFile('node_modules/react/index.js')).toBe(true);
    expect(isExcludedFile('dist/bundle.js')).toBe(true);
    expect(isExcludedFile('.next/server/page.js')).toBe(true);
    expect(isExcludedFile('e2e/login.ts')).toBe(true);
    expect(isExcludedFile('app/__tests__/page.test.tsx')).toBe(true);
  });

  it('tolerates Windows-style separators', () => {
    expect(isExcludedFile('src\\__tests__\\x.ts')).toBe(true);
    expect(isExcludedFile('node_modules\\react\\index.js')).toBe(true);
  });

  it('keeps real source files', () => {
    expect(isExcludedFile('app/dashboard/page.tsx')).toBe(false);
    expect(isExcludedFile('components/ui/button.tsx')).toBe(false);
    expect(isExcludedFile('app/actions/create-post.ts')).toBe(false);
    expect(isExcludedFile('src/narrative.ts')).toBe(false);
  });
});
