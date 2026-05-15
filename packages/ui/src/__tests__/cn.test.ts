import { describe, it, expect } from 'vitest';
import { cn } from '../lib/cn.js';

describe('cn — Tailwind class merger', () => {
  it('concatenates plain class strings with a single space', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('returns an empty string when given nothing', () => {
    expect(cn()).toBe('');
  });

  it('ignores falsy values (false, null, undefined, "")', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('applies conditional classes via object syntax', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active');
  });

  it('flattens nested arrays of class values', () => {
    expect(cn(['a', ['b', ['c']]], 'd')).toBe('a b c d');
  });

  it('resolves Tailwind conflicts (later wins)', () => {
    // tailwind-merge collapses `p-2 p-4` into `p-4`.
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
  });

  it('preserves non-conflicting Tailwind utilities together', () => {
    const result = cn('px-4', 'py-2', 'bg-blue-500');
    expect(result.split(' ').sort()).toEqual(
      ['bg-blue-500', 'px-4', 'py-2'].sort(),
    );
  });
});
