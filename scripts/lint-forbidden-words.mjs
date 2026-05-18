#!/usr/bin/env node
// Forbidden-word lint for marketing copy (Sprint 4 W3.QA.2).
//
// Purpose: surface superlative / absolute claims in i18n marketing strings
// that risk violating Korean 표시·광고의 공정화에 관한 법률 ("표시광고법")
// and FTC-style "deceptive comparative advertising" rules. These words assert
// objective superiority ("the only", "최고", "1위") without verifiable evidence
// — the legal-safe pattern is to scope every claim ("evidence-based", "for
// vibe coders") or omit it entirely.
//
// Behaviour:
//   - Scans apps/web/lib/i18n/{ko,en}.ts for string-literal values only.
//   - Comments and key names are ignored (so `// 최초 도입`은 통과).
//   - Exit 1 with file:line + offending value when any pattern fires.
//   - Exit 0 silently when clean.
//
// Auto-fix is intentionally NOT supported — the human must choose replacement
// wording (e.g. "근거 기반", "바이브 코더 전용").

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const TARGETS = [
  resolve(ROOT, 'apps/web/lib/i18n/ko.ts'),
  resolve(ROOT, 'apps/web/lib/i18n/en.ts'),
];

// Patterns are matched against the *string value* only (single- or
// double-quoted, plus template literals). Each rule has a label so the report
// pinpoints which superlative tripped.
//
// Korean: 표시광고법 §3 — 거짓·과장·기만·부당비교·비방 광고 금지. Absolute
//         superlatives ("유일한/최초/최고/1위") demand a verifiable source.
// English: FTC Endorsement Guides + EU UCPD — "the best", "#1" require an
//          objective basis (independent benchmark, certified survey, etc.).
const FORBIDDEN_KO = [
  { id: 'ko-only', label: '유일성 단정', pattern: /유일한|유일무이|유일|독보적|독자적/ },
  { id: 'ko-first', label: '최초 표현', pattern: /(?<![A-Za-z가-힣])최초(?![A-Za-z가-힣])|국내\s*최초|업계\s*최초|세계\s*최초/ },
  { id: 'ko-best', label: '최상급 표현', pattern: /(?<![A-Za-z가-힣])최고(?![A-Za-z가-힣])|최강|최상의|가장\s*우수|가장\s*뛰어난|업계\s*최고/ },
  { id: 'ko-rank', label: '순위 단정', pattern: /(?<![\d])1\s*위(?![\d])|넘버\s*원|넘버원|랭킹\s*1/ },
  { id: 'ko-perfect', label: '완벽 단정', pattern: /완벽한|완전한\s*해결|100%\s*보장/ },
];

const FORBIDDEN_EN = [
  { id: 'en-only', label: 'absolute uniqueness', pattern: /\bthe only\b|\bone of a kind\b|\bunrivaled\b|\bunmatched\b/i },
  { id: 'en-best', label: 'absolute superlative', pattern: /\bthe best\b|\bworld[-\s]?class\b|\bbest[-\s]?in[-\s]?class\b|\bunbeatable\b/i },
  { id: 'en-leader', label: 'leadership claim', pattern: /\bindustry[-\s]?leading\b|\bmarket[-\s]?leading\b|\bleading\s+(platform|product|tool|solution|provider)\b/i },
  { id: 'en-rank', label: 'rank claim', pattern: /\bnumber\s*one\b|#\s*1\b|\btop[-\s]?ranked\b/i },
  { id: 'en-perfect', label: 'perfection claim', pattern: /\bperfect\s+(solution|product|tool)\b|\b100%\s+guaranteed\b/i },
];

// Extract string-literal values from a TS source line. Matches:
//   'single'   "double"   `template (no interpolation)`
// Returns array of {value, columnStart}. Skips line-comment portion (// ...).
function extractStringLiterals(line) {
  const commentIdx = line.indexOf('//');
  const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    out.push({ value: m[2], columnStart: m.index + 1 });
  }
  return out;
}

function scanFile(filePath, rules) {
  const source = readFileSync(filePath, 'utf8');
  const lines = source.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const literals = extractStringLiterals(lines[i]);
    if (literals.length === 0) continue;
    for (const { value } of literals) {
      for (const rule of rules) {
        if (rule.pattern.test(value)) {
          hits.push({
            file: filePath,
            line: i + 1,
            ruleId: rule.id,
            ruleLabel: rule.label,
            value,
          });
        }
      }
    }
  }
  return hits;
}

function main() {
  const allHits = [];
  for (const file of TARGETS) {
    const rules = file.endsWith('ko.ts') ? FORBIDDEN_KO : FORBIDDEN_EN;
    allHits.push(...scanFile(file, rules));
  }
  if (allHits.length === 0) {
    console.log('lint-forbidden-words: PASS — 0 violations across ko/en i18n.');
    process.exit(0);
  }
  console.error(`lint-forbidden-words: FAIL — ${allHits.length} violation(s):`);
  for (const h of allHits) {
    const rel = h.file.replace(ROOT + '\\', '').replace(ROOT + '/', '');
    console.error(`  ${rel}:${h.line}  [${h.ruleId}] ${h.ruleLabel}`);
    console.error(`    ${JSON.stringify(h.value)}`);
  }
  console.error('');
  console.error('Replace superlatives with scoped, evidence-backed phrasing.');
  console.error('Examples: "근거 기반", "바이브 코더 전용", "evidence-backed".');
  process.exit(1);
}

main();
