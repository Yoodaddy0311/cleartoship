import { describe, it, expect } from 'vitest';
import {
  FRIENDLY_EXPLAINERS,
  explainFinding,
  extractSemgrepRuleId,
} from './finding-explainer.js';

// rule_id 별 한국어 풀이가 누락 없이 채워졌는지 회귀 방지.
// 200개 finding 카드가 똑같이 보이는 문제를 막기 위한 최소 매핑 셋.
const REQUIRED_EXACT_RULES: ReadonlyArray<string> = [
  'javascript.lang.security.audit.eval',
  'javascript.lang.security.audit.dangerously-set-inner-html',
  'javascript.lang.security.audit.detect-non-literal-fs-filename',
  'javascript.express.security.audit.express-cookie-session-no-secure',
  'javascript.lang.audit.unencrypted-cookie-secret',
  'javascript.lang.security.audit.detect-child-process',
  'javascript.lang.security.audit.detect-non-literal-regexp',
  'javascript.lang.security.audit.detect-pseudo-random-bytes',
  'typescript.react.security.audit.react-href-var',
  'typescript.react.security.audit.react-no-refs',
  'python.flask.security.audit.directly-returned-format-string',
  'python.django.security.audit.raw-query',
  'python.lang.security.audit.dangerous-subprocess-use',
  'generic.secrets.security.detected-aws-access-key-id',
  'generic.secrets.security.detected-private-key',
  'generic.secrets.security.detected-generic-api-key',
];

const REQUIRED_WILDCARD_RULES: ReadonlyArray<string> = [
  'javascript.lang.security.audit.*',
  'typescript.react.security.audit.*',
  'python.flask.security.audit.*',
  'python.django.security.audit.*',
  'generic.secrets.security.*',
];

describe('FRIENDLY_EXPLAINERS', () => {
  it('contains at least 20 entries total (exact + wildcard)', () => {
    expect(Object.keys(FRIENDLY_EXPLAINERS).length).toBeGreaterThanOrEqual(20);
  });

  it('contains every required exact rule_id', () => {
    for (const rule of REQUIRED_EXACT_RULES) {
      expect(FRIENDLY_EXPLAINERS[rule], `missing exact mapping for ${rule}`).toBeDefined();
    }
  });

  it('contains every required wildcard rule_id', () => {
    for (const rule of REQUIRED_WILDCARD_RULES) {
      expect(FRIENDLY_EXPLAINERS[rule], `missing wildcard mapping for ${rule}`).toBeDefined();
    }
  });

  it('every entry has non-empty what/why/fixGuide', () => {
    for (const [key, value] of Object.entries(FRIENDLY_EXPLAINERS)) {
      expect(value.what.length, `what empty for ${key}`).toBeGreaterThan(0);
      expect(value.why.length, `why empty for ${key}`).toBeGreaterThan(0);
      expect(value.fixGuide.length, `fixGuide empty for ${key}`).toBeGreaterThan(0);
    }
  });
});

describe('explainFinding', () => {
  it('returns the exact mapping when rule matches', () => {
    const out = explainFinding('javascript.lang.security.audit.eval');
    expect(out.what).toMatch(/eval/);
    expect(out.analogy).toBeDefined();
  });

  it('falls back to the most-specific wildcard when no exact match', () => {
    const out = explainFinding('javascript.lang.security.audit.some-unknown-rule');
    expect(out).toBe(FRIENDLY_EXPLAINERS['javascript.lang.security.audit.*']);
  });

  it('prefers the longer wildcard prefix when multiple match', () => {
    // 가공의 와일드카드 충돌 케이스. 두 와일드카드 모두 매칭되지만 더 긴
    // prefix (`...react.security.audit.*`) 가 이겨야 한다.
    const out = explainFinding('typescript.react.security.audit.fake-rule');
    expect(out).toBe(FRIENDLY_EXPLAINERS['typescript.react.security.audit.*']);
  });

  it('uses the fallback title/summary when no mapping exists', () => {
    const out = explainFinding('totally.unmapped.rule', {
      title: 'avoid using deprecated API',
      summary: 'this should not be called',
    });
    // lightlyNormalizeSummary should uppercase + substitute keywords.
    expect(out.what.charAt(0)).toBe(out.what.charAt(0).toUpperCase());
    expect(out.why).toMatch(/권장/); // "should" -> "권장"
    expect(out.fixGuide).toMatch(/totally\.unmapped\.rule/);
  });

  it('returns a generic explanation when no mapping and no fallback', () => {
    const out = explainFinding('totally.unmapped.rule');
    expect(out.what.length).toBeGreaterThan(0);
    expect(out.why.length).toBeGreaterThan(0);
    expect(out.fixGuide).toMatch(/totally\.unmapped\.rule/);
  });

  it('does not return the same explanation for two distinct mapped rules', () => {
    // 200개 finding 이 똑같은 한 줄로 보이는 문제를 재발하지 않도록.
    const a = explainFinding('javascript.lang.security.audit.eval');
    const b = explainFinding('generic.secrets.security.detected-aws-access-key-id');
    expect(a.what).not.toBe(b.what);
    expect(a.why).not.toBe(b.why);
  });
});

describe('extractSemgrepRuleId', () => {
  it('returns the rule id when title has the Semgrep prefix', () => {
    expect(
      extractSemgrepRuleId('Semgrep: javascript.lang.security.audit.eval')
    ).toBe('javascript.lang.security.audit.eval');
  });

  it('is case-insensitive on the prefix', () => {
    expect(extractSemgrepRuleId('semgrep: rule.id.here')).toBe('rule.id.here');
  });

  it('returns null when the title is not a Semgrep finding', () => {
    expect(extractSemgrepRuleId('관리자 API에 인증 검증이 없습니다')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(extractSemgrepRuleId('  Semgrep:   foo.bar  ')).toBe('foo.bar');
  });
});
