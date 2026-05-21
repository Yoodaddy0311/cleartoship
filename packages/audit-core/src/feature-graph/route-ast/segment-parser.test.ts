import { describe, it, expect } from 'vitest';
import { parseSegment, segmentsToUrlPath } from './segment-parser.js';

describe('parseSegment', () => {
  it('detects static segments', () => {
    expect(parseSegment('users')).toEqual({ name: 'users', kind: 'static' });
  });

  it('detects dynamic segments', () => {
    expect(parseSegment('[id]')).toEqual({ name: 'id', kind: 'dynamic' });
  });

  it('detects catch-all segments', () => {
    expect(parseSegment('[...slug]')).toEqual({ name: 'slug', kind: 'catchAll' });
  });

  it('detects optional catch-all segments BEFORE plain catch-all', () => {
    // Order matters — [[...x]] also matches [...x] regex if tested first.
    expect(parseSegment('[[...slug]]')).toEqual({
      name: 'slug',
      kind: 'optionalCatchAll',
    });
  });

  it('detects route groups', () => {
    expect(parseSegment('(marketing)')).toEqual({
      name: 'marketing',
      kind: 'group',
    });
  });

  it('treats malformed brackets as static segments', () => {
    expect(parseSegment('[')).toEqual({ name: '[', kind: 'static' });
    expect(parseSegment('()')).toEqual({ name: '()', kind: 'static' });
  });
});

describe('segmentsToUrlPath', () => {
  it('returns "/" for empty input', () => {
    expect(segmentsToUrlPath([])).toBe('/');
  });

  it('joins static segments with slashes', () => {
    expect(
      segmentsToUrlPath([
        { name: 'users', kind: 'static' },
        { name: 'profile', kind: 'static' },
      ])
    ).toBe('/users/profile');
  });

  it('drops group segments from the URL', () => {
    expect(
      segmentsToUrlPath([
        { name: 'marketing', kind: 'group' },
        { name: 'about', kind: 'static' },
      ])
    ).toBe('/about');
  });

  it('preserves brackets on dynamic / catch-all segments', () => {
    expect(
      segmentsToUrlPath([
        { name: 'users', kind: 'static' },
        { name: 'id', kind: 'dynamic' },
      ])
    ).toBe('/users/[id]');
    expect(
      segmentsToUrlPath([
        { name: 'docs', kind: 'static' },
        { name: 'slug', kind: 'catchAll' },
      ])
    ).toBe('/docs/[...slug]');
    expect(
      segmentsToUrlPath([
        { name: 'docs', kind: 'static' },
        { name: 'slug', kind: 'optionalCatchAll' },
      ])
    ).toBe('/docs/[[...slug]]');
  });
});
