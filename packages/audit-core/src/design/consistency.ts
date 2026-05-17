// Design consistency analyzer — inspects Tailwind/CSS token usage across a
// codebase and surfaces palette sprawl, off-scale spacing, arbitrary values,
// and duplicated className combinations. Pure module: the caller injects a
// `readFile` adapter so the same analyzer runs in the worker (Node fs) and in
// unit tests (in-memory map).
//
// Source: design consistency rules requested by team-lead — no equivalent
// rules existed in the UX_UI category prior to this module (axe-core covered
// accessibility only).

import type { NormalizedFinding } from '../adapter.js';

export interface AnalyzeDesignInput {
  projectRoot: string;
  fileTree: readonly string[];
  /**
   * File-content reader. Receives a path relative to `projectRoot` (POSIX-
   * style separators, same shape as `fileTree` entries) and returns the
   * file's UTF-8 text, or `null` when the file is unavailable.
   *
   * Optional so callers can pass only `fileTree` for a structure-only run
   * (no classname inventory). In that mode the analyzer skips rules that
   * require file bodies.
   */
  readFile?: (relPath: string) => Promise<string | null>;
}

export interface DesignConsistencyReport {
  tokens: {
    colors: {
      defined: number;
      used: number;
      arbitrary: number;
      topOffenders: string[];
    };
    spacing: {
      defined: number;
      used: number;
      offScale: string[];
    };
    fontSize: {
      defined: number;
      used: number;
    };
  };
  duplications: Array<{
    pattern: string;
    occurrences: { path: string; line: number }[];
  }>;
  variantSprawl: Array<{ component: string; uniqueClassCombos: number }>;
  /** 0..100, 100 = perfectly consistent. */
  score: number;
}

export interface AnalyzeDesignResult {
  report: DesignConsistencyReport;
  findings: NormalizedFinding[];
}

const TAILWIND_CONFIG_NAMES = [
  'tailwind.config.ts',
  'tailwind.config.js',
  'tailwind.config.mjs',
  'tailwind.config.cjs',
];

const TSX_JSX_EXTENSIONS = ['.tsx', '.jsx'];
const CSS_EXTENSIONS = ['.css', '.scss'];

const MAX_FILES_INSPECTED = 400;
const CLASSNAME_RE = /className\s*=\s*["'`]([^"'`]+)["'`]/g;
const ARBITRARY_COLOR_RE = /\[#[0-9a-fA-F]{3,8}\]/;
const ARBITRARY_LENGTH_RE = /\[(?:[\d.]+)(?:px|rem|em|%|vh|vw)\]/;
const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
const CSS_LENGTH_RE = /\b(?:[\d.]+)(?:px|rem|em)\b/g;
const CSS_CUSTOM_PROP_RE = /--[a-z][a-z0-9-]*\s*:/g;

// ---------- Tailwind config extraction (regex only, no eval) ----------

interface ExtractedTokens {
  colors: Set<string>;
  spacing: Set<string>;
  fontSize: Set<string>;
}

function extractTokensFromConfig(source: string): ExtractedTokens {
  return {
    colors: extractKeysFromSection(source, 'colors'),
    spacing: extractKeysFromSection(source, 'spacing'),
    fontSize: extractKeysFromSection(source, 'fontSize'),
  };
}

/**
 * Find `key: { ... }` blocks under `theme.extend.<section>` or
 * `theme.<section>` and return the top-level keys inside the braces.
 * We never execute the config — just count keys. The regex is intentionally
 * permissive: it tolerates trailing commas, nested objects, and string keys.
 */
function extractKeysFromSection(source: string, section: string): Set<string> {
  const keys = new Set<string>();
  const headerRe = new RegExp(`${section}\\s*:\\s*\\{`, 'g');
  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(source)) !== null) {
    const openIdx = match.index + match[0].length - 1;
    const body = sliceBalancedBraces(source, openIdx);
    if (!body) continue;
    for (const key of topLevelKeys(body)) keys.add(key);
  }
  return keys;
}

function sliceBalancedBraces(source: string, openIdx: number): string | null {
  if (source[openIdx] !== '{') return null;
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(openIdx + 1, i);
    }
  }
  return null;
}

function topLevelKeys(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let i = 0;
  while (i < body.length) {
    const ch = body[i]!;
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    if (depth === 0 && (ch === '"' || ch === "'" || ch === '`')) {
      const end = body.indexOf(ch, i + 1);
      if (end === -1) break;
      const literal = body.slice(i + 1, end);
      const afterStr = skipWhitespace(body, end + 1);
      if (body[afterStr] === ':') {
        out.push(literal);
      }
      i = end + 1;
      continue;
    }
    if (depth === 0 && /[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < body.length && /[\w$-]/.test(body[j]!)) j++;
      const ident = body.slice(i, j);
      const afterIdent = skipWhitespace(body, j);
      if (body[afterIdent] === ':' && ident.length > 0) {
        out.push(ident);
      }
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

function skipWhitespace(source: string, from: number): number {
  let i = from;
  while (i < source.length && /\s/.test(source[i]!)) i++;
  return i;
}

// ---------- CSS custom property extraction ----------

function extractCssCustomProperties(text: string): string[] {
  const found: string[] = [];
  const matches = text.match(CSS_CUSTOM_PROP_RE);
  if (!matches) return found;
  for (const m of matches) {
    const name = m.replace(/\s*:$/, '').trim();
    found.push(name);
  }
  return found;
}

// ---------- className inventory ----------

interface ClassUsage {
  /** Map token -> list of file:line where it appears. */
  tokens: Map<string, Array<{ path: string; line: number }>>;
  /** Set of sorted "combo signatures" -> occurrences. */
  combos: Map<string, Array<{ path: string; line: number }>>;
  /** Raw token counter (with duplicates across files). */
  totalTokens: number;
  /** Counter of arbitrary color tokens. */
  arbitraryColors: number;
  /** Counter of arbitrary length tokens. */
  arbitraryLengths: number;
}

function emptyUsage(): ClassUsage {
  return {
    tokens: new Map(),
    combos: new Map(),
    totalTokens: 0,
    arbitraryColors: 0,
    arbitraryLengths: 0,
  };
}

function recordClassNames(text: string, relPath: string, usage: ClassUsage): void {
  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    CLASSNAME_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CLASSNAME_RE.exec(line)) !== null) {
      const raw = m[1]!;
      const tokens = raw
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      if (tokens.length === 0) continue;

      // Combo signature: sorted dedup so "p-2 bg-red" == "bg-red p-2".
      const combo = [...new Set(tokens)].sort().join(' ');
      pushOccurrence(usage.combos, combo, relPath, li + 1);

      for (const t of tokens) {
        usage.totalTokens++;
        pushOccurrence(usage.tokens, t, relPath, li + 1);
        if (ARBITRARY_COLOR_RE.test(t)) usage.arbitraryColors++;
        if (ARBITRARY_LENGTH_RE.test(t)) usage.arbitraryLengths++;
      }
    }
  }
}

function pushOccurrence(
  map: Map<string, Array<{ path: string; line: number }>>,
  key: string,
  relPath: string,
  line: number,
): void {
  const existing = map.get(key);
  if (existing) existing.push({ path: relPath, line });
  else map.set(key, [{ path: relPath, line }]);
}

// ---------- token usage classification ----------

function countColorUsage(usage: ClassUsage): { used: Set<string>; topOffenders: string[] } {
  const colorTokens = new Set<string>();
  const counter = new Map<string, number>();
  for (const [token, occs] of usage.tokens.entries()) {
    const colorName = extractTailwindColorName(token);
    if (colorName !== null) {
      colorTokens.add(colorName);
      counter.set(colorName, (counter.get(colorName) ?? 0) + occs.length);
    }
  }
  const topOffenders = [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
  return { used: colorTokens, topOffenders };
}

/**
 * Extracts the color name from a Tailwind utility token, e.g. `bg-red-500` ->
 * `red`, `text-slate-700` -> `slate`. Returns null for non-color tokens or
 * arbitrary values.
 */
function extractTailwindColorName(token: string): string | null {
  if (token.includes('[')) return null;
  const prefixes = ['bg-', 'text-', 'border-', 'ring-', 'fill-', 'stroke-', 'from-', 'to-', 'via-'];
  for (const p of prefixes) {
    if (token.startsWith(p)) {
      const rest = token.slice(p.length);
      const name = rest.split('-')[0];
      if (!name) return null;
      // Filter out non-color words like "auto", "current", "transparent" — keep
      // them as a color reference but exclude generic layout tokens.
      if (/^(auto|none|center|left|right|inherit)$/.test(name)) return null;
      return name;
    }
  }
  return null;
}

function countSpacingUsage(
  usage: ClassUsage,
  defined: ReadonlySet<string>,
): { used: Set<string>; offScale: string[] } {
  const used = new Set<string>();
  const offScale = new Set<string>();
  const spacingPrefixes = ['p-', 'px-', 'py-', 'pt-', 'pr-', 'pb-', 'pl-', 'm-', 'mx-', 'my-', 'mt-', 'mr-', 'mb-', 'ml-', 'gap-', 'space-x-', 'space-y-'];
  for (const token of usage.tokens.keys()) {
    for (const p of spacingPrefixes) {
      if (!token.startsWith(p)) continue;
      const rest = token.slice(p.length);
      used.add(rest);
      if (rest.startsWith('[') && rest.endsWith(']')) {
        offScale.add(token);
      } else if (defined.size > 0 && !defined.has(rest) && !DEFAULT_TAILWIND_SPACING.has(rest)) {
        offScale.add(token);
      }
      break;
    }
  }
  return { used, offScale: [...offScale].slice(0, 20) };
}

const DEFAULT_TAILWIND_SPACING = new Set([
  '0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '5', '6', '7', '8', '9', '10', '11', '12',
  '14', '16', '20', '24', '28', '32', '36', '40', '44', '48', '52', '56', '60', '64', '72', '80', '96',
  'px', 'auto', 'full', 'screen',
]);

function countFontSizeUsage(usage: ClassUsage): Set<string> {
  const used = new Set<string>();
  for (const token of usage.tokens.keys()) {
    if (token.startsWith('text-')) {
      const rest = token.slice('text-'.length);
      // text-sm, text-lg etc. — exclude color tokens
      if (/^(xs|sm|base|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/.test(rest)) {
        used.add(rest);
      }
    }
  }
  return used;
}

// ---------- Variant sprawl detection ----------

function detectVariantSprawl(
  usage: ClassUsage,
): Array<{ component: string; uniqueClassCombos: number }> {
  // Group combos by file: a file with many distinct className strings on the
  // same kind of element is a sprawl hot spot.
  const byFile = new Map<string, Set<string>>();
  for (const [combo, occs] of usage.combos.entries()) {
    for (const o of occs) {
      const set = byFile.get(o.path) ?? new Set<string>();
      set.add(combo);
      byFile.set(o.path, set);
    }
  }
  const out: Array<{ component: string; uniqueClassCombos: number }> = [];
  for (const [path, combos] of byFile.entries()) {
    if (combos.size >= 8) {
      out.push({ component: path, uniqueClassCombos: combos.size });
    }
  }
  return out.sort((a, b) => b.uniqueClassCombos - a.uniqueClassCombos).slice(0, 10);
}

// ---------- Main analyzer ----------

export async function analyzeDesignConsistency(
  input: AnalyzeDesignInput,
): Promise<AnalyzeDesignResult> {
  const { fileTree, readFile } = input;

  const tailwindConfigPath = fileTree.find((p) =>
    TAILWIND_CONFIG_NAMES.some((name) => p === name || p.endsWith('/' + name)),
  );

  let defined: ExtractedTokens = {
    colors: new Set(),
    spacing: new Set(),
    fontSize: new Set(),
  };
  const cssCustomProps: string[] = [];

  if (tailwindConfigPath && readFile) {
    const cfg = await safeRead(readFile, tailwindConfigPath);
    if (cfg) defined = extractTokensFromConfig(cfg);
  }

  const cssFiles = fileTree.filter((p) => CSS_EXTENSIONS.some((ext) => p.endsWith(ext)));
  if (readFile) {
    for (const cssPath of cssFiles.slice(0, 50)) {
      const css = await safeRead(readFile, cssPath);
      if (css) cssCustomProps.push(...extractCssCustomProperties(css));
    }
  }

  const usage = emptyUsage();
  const componentFiles = fileTree.filter((p) =>
    TSX_JSX_EXTENSIONS.some((ext) => p.endsWith(ext)),
  );
  if (readFile) {
    for (const compPath of componentFiles.slice(0, MAX_FILES_INSPECTED)) {
      const body = await safeRead(readFile, compPath);
      if (body) recordClassNames(body, compPath, usage);
    }
  }

  const colors = countColorUsage(usage);
  const spacing = countSpacingUsage(usage, defined.spacing);
  const fontSize = countFontSizeUsage(usage);

  const duplications: DesignConsistencyReport['duplications'] = [];
  for (const [combo, occs] of usage.combos.entries()) {
    if (occs.length >= 5 && combo.split(' ').length >= 3) {
      duplications.push({ pattern: combo, occurrences: occs.slice(0, 10) });
    }
  }
  duplications.sort((a, b) => b.occurrences.length - a.occurrences.length);

  const variantSprawl = detectVariantSprawl(usage);

  const report: DesignConsistencyReport = {
    tokens: {
      colors: {
        defined: defined.colors.size + cssCustomProps.filter((p) => p.includes('color')).length,
        used: colors.used.size,
        arbitrary: usage.arbitraryColors,
        topOffenders: colors.topOffenders,
      },
      spacing: {
        defined: defined.spacing.size,
        used: spacing.used.size,
        offScale: spacing.offScale,
      },
      fontSize: {
        defined: defined.fontSize.size,
        used: fontSize.size,
      },
    },
    duplications: duplications.slice(0, 10),
    variantSprawl,
    score: computeScore({
      colorsUsed: colors.used.size,
      arbitraryColors: usage.arbitraryColors,
      arbitraryLengths: usage.arbitraryLengths,
      totalTokens: usage.totalTokens,
      offScaleSpacing: spacing.offScale.length,
      duplications: duplications.length,
    }),
  };

  const findings = buildFindings(report, usage);
  return { report, findings };
}

async function safeRead(
  readFile: (p: string) => Promise<string | null>,
  path: string,
): Promise<string | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

function computeScore(params: {
  colorsUsed: number;
  arbitraryColors: number;
  arbitraryLengths: number;
  totalTokens: number;
  offScaleSpacing: number;
  duplications: number;
}): number {
  let score = 100;
  if (params.colorsUsed > 12) score -= Math.min(25, (params.colorsUsed - 12) * 2);
  if (params.totalTokens > 0) {
    const arbitraryRatio =
      (params.arbitraryColors + params.arbitraryLengths) / params.totalTokens;
    if (arbitraryRatio > 0.05) score -= Math.min(20, Math.round(arbitraryRatio * 100));
  }
  score -= Math.min(15, params.offScaleSpacing);
  score -= Math.min(15, params.duplications * 3);
  return Math.max(0, Math.min(100, score));
}

// ---------- Findings construction ----------

function buildFindings(
  report: DesignConsistencyReport,
  usage: ClassUsage,
): NormalizedFinding[] {
  const findings: NormalizedFinding[] = [];
  const { colors, spacing } = report.tokens;

  if (colors.used > 12) {
    findings.push({
      title: `색상 사용이 ${colors.used}종에 달합니다 — 디자인 토큰화 권장`,
      category: 'UX_UI',
      severity: 'P1',
      confidence: 'MEDIUM',
      summary: `프로젝트 전반에서 ${colors.used}종의 색상 계열이 사용되었습니다. 권장 한도는 12종 이하입니다.`,
      nonDeveloperExplanation:
        '화면마다 사용되는 색상이 너무 많아 사용자가 일관된 인상을 받기 어렵습니다. 핵심 색상 팔레트를 정해두면 디자인 통일감이 살아납니다.',
      technicalExplanation: `Top offenders: ${colors.topOffenders.join(', ') || '(unknown)'}. arbitrary color tokens: ${colors.arbitrary}.`,
      impact: '브랜드 인식 약화, 다크 모드/테마 도입 시 유지보수 비용 증가.',
      recommendation:
        'tailwind.config 의 theme.colors 에 핵심 팔레트를 등록하고, 컴포넌트에서는 의미 기반 토큰(예: bg-primary, text-muted)을 사용하세요.',
      acceptanceCriteria: [
        '핵심 색상 토큰이 tailwind.config 또는 CSS custom property 로 정의되어 있다.',
        '컴포넌트 className 에서 사용되는 색상 계열이 12종 이하다.',
        '임의 hex 색상 값(`[#abcdef]`) 사용이 0건이다.',
      ],
      tags: ['design-consistency', 'palette'],
      evidences: topOffenderEvidences(usage, colors.topOffenders),
    });
  }

  if (usage.totalTokens > 0) {
    const arbitraryTotal = usage.arbitraryColors + usage.arbitraryLengths;
    const ratio = arbitraryTotal / usage.totalTokens;
    if (ratio > 0.05) {
      findings.push({
        title: `임의값 사용 비중이 ${(ratio * 100).toFixed(1)}% — 디자인 토큰을 우회하고 있습니다`,
        category: 'UX_UI',
        severity: 'P2',
        confidence: 'MEDIUM',
        summary: `tailwind 임의값 표기(\`[#fff]\`, \`[13px]\`)가 총 ${arbitraryTotal}건으로 사용 토큰의 ${(ratio * 100).toFixed(1)}%를 차지합니다.`,
        nonDeveloperExplanation:
          '디자인 시스템의 정해진 값 대신 그때그때 임의 값을 쓰는 비중이 높습니다. 사소한 변경이 화면 전체에 자동 반영되지 못해 일관성 유지가 어렵습니다.',
        technicalExplanation: `arbitrary color tokens=${usage.arbitraryColors}, arbitrary length tokens=${usage.arbitraryLengths}, total classNames=${usage.totalTokens}.`,
        impact: '리브랜딩/다크 모드 도입 시 일괄 수정 불가, 디자인 시스템 신뢰도 저하.',
        recommendation:
          '임의값이 반복 사용된 값을 모아 tailwind.config 의 theme.colors / theme.spacing 에 정식 토큰으로 등록하세요.',
        acceptanceCriteria: [
          '임의값(`[...]`) 사용 비중이 전체 토큰의 5% 이하다.',
          '재사용되는 hex 색상은 모두 theme.colors 에 등록되어 있다.',
        ],
        tags: ['design-consistency', 'arbitrary-values'],
        evidences: arbitraryEvidences(usage),
      });
    }
  }

  if (spacing.offScale.length >= 10) {
    findings.push({
      title: `스케일 외 spacing 값이 ${spacing.offScale.length}건 발견되었습니다`,
      category: 'UX_UI',
      severity: 'P2',
      confidence: 'MEDIUM',
      summary: `tailwind 기본 spacing 스케일 또는 프로젝트 정의 스케일에 포함되지 않는 padding/margin/gap 값이 ${spacing.offScale.length}건 감지되었습니다.`,
      nonDeveloperExplanation:
        '여백 값이 들쭉날쭉하면 화면이 정돈되어 보이지 않습니다. 정해진 간격 단위를 사용해야 시각적 리듬이 살아납니다.',
      technicalExplanation: `Off-scale samples: ${spacing.offScale.slice(0, 6).join(', ')}`,
      impact: '시각적 리듬 붕괴, 리뷰 단계에서 디자이너 피드백 반복.',
      recommendation:
        'theme.spacing 에 프로젝트 스케일(예: 4/8/12/16/24)을 등록하고 컴포넌트에서는 등록된 단위만 사용하세요.',
      acceptanceCriteria: [
        '모든 padding/margin/gap 토큰이 theme.spacing 또는 기본 tailwind 스케일에 정의되어 있다.',
        '임의 px/rem 값(`[13px]` 등) 사용이 0건이다.',
      ],
      tags: ['design-consistency', 'spacing'],
      evidences: spacing.offScale.slice(0, 5).map((tok) => ({
        type: 'CODE_SNIPPET' as const,
        source: 'design-consistency',
        path: usage.tokens.get(tok)?.[0]?.path ?? null,
        lineStart: usage.tokens.get(tok)?.[0]?.line ?? null,
        lineEnd: usage.tokens.get(tok)?.[0]?.line ?? null,
        url: null,
        selector: null,
        screenshotPath: null,
        snippet: tok,
        maskedValue: null,
        metadata: { token: tok },
      })),
    });
  }

  if (report.duplications.length > 0) {
    const top = report.duplications[0]!;
    findings.push({
      title: `중복 className 조합 ${report.duplications.length}건 — 공용 컴포넌트화 권장`,
      category: 'UX_UI',
      severity: 'P2',
      confidence: 'MEDIUM',
      summary: `동일한 className 조합이 ${top.occurrences.length}곳에서 반복됩니다 ("${truncate(top.pattern, 80)}").`,
      nonDeveloperExplanation:
        '같은 스타일 조합을 여기저기 복사해 두면, 디자인이 바뀔 때 한 곳만 고쳐도 다른 곳은 그대로 남아 결과가 달라질 수 있습니다.',
      technicalExplanation: `Detected ${report.duplications.length} className combos repeated 5+ times. Top combo: \`${top.pattern}\`.`,
      impact: '디자인 변경 누락, 시각적 회귀(visual regression) 위험.',
      recommendation:
        '반복되는 className 조합을 Button/Badge 등 공용 컴포넌트나 cva/clsx 베이스 스타일로 추출하세요.',
      acceptanceCriteria: [
        '동일 className 조합이 5곳 이상 반복되지 않는다.',
        '공용 비주얼 패턴은 재사용 가능한 컴포넌트로 추출되어 있다.',
      ],
      tags: ['design-consistency', 'duplication'],
      evidences: top.occurrences.slice(0, 5).map((o) => ({
        type: 'CODE_SNIPPET' as const,
        source: 'design-consistency',
        path: o.path,
        lineStart: o.line,
        lineEnd: o.line,
        url: null,
        selector: null,
        screenshotPath: null,
        snippet: top.pattern,
        maskedValue: null,
        metadata: { combo: top.pattern },
      })),
    });
  }

  return findings;
}

function topOffenderEvidences(
  usage: ClassUsage,
  offenders: readonly string[],
): NormalizedFinding['evidences'] {
  const out: NormalizedFinding['evidences'] = [];
  for (const colorName of offenders.slice(0, 3)) {
    for (const [token, occs] of usage.tokens.entries()) {
      if (extractTailwindColorName(token) === colorName && occs.length > 0) {
        const first = occs[0]!;
        out.push({
          type: 'CODE_SNIPPET',
          source: 'design-consistency',
          path: first.path,
          lineStart: first.line,
          lineEnd: first.line,
          url: null,
          selector: null,
          screenshotPath: null,
          snippet: token,
          maskedValue: null,
          metadata: { color: colorName, token },
        });
        break;
      }
    }
  }
  return out;
}

function arbitraryEvidences(usage: ClassUsage): NormalizedFinding['evidences'] {
  const out: NormalizedFinding['evidences'] = [];
  for (const [token, occs] of usage.tokens.entries()) {
    if (ARBITRARY_COLOR_RE.test(token) || ARBITRARY_LENGTH_RE.test(token)) {
      const first = occs[0]!;
      out.push({
        type: 'CODE_SNIPPET',
        source: 'design-consistency',
        path: first.path,
        lineStart: first.line,
        lineEnd: first.line,
        url: null,
        selector: null,
        screenshotPath: null,
        snippet: token,
        maskedValue: null,
        metadata: { arbitraryToken: token },
      });
      if (out.length >= 5) break;
    }
  }
  return out;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

// Re-export internal helpers for the test harness — these are not part of the
// public package surface but tests need them.
export const __internals = {
  extractTokensFromConfig,
  extractCssCustomProperties,
  recordClassNames,
  emptyUsage,
  computeScore,
  HEX_COLOR_RE,
  CSS_LENGTH_RE,
};
