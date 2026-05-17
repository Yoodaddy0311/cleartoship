// Risky function discovery — regex-based identification of code surfaces that
// commonly carry security/data-mutation risk (auth, payment, hard delete, PII,
// auth boundary, untransactioned data mutation).
//
// MVP intentionally avoids AST parsing: we only need *candidates* for a later
// LLM verification pass. False positives are acceptable, false negatives are
// the failure mode we minimize via name + body heuristics.
//
// Output shape is consumed by `step18DiscoverRiskyFunctions` in the worker.

export type RiskCategory =
  | 'auth'
  | 'payment'
  | 'delete'
  | 'pii'
  | 'auth-boundary'
  | 'data-mutation';

export interface RiskyFunction {
  category: RiskCategory;
  path: string;
  line: number;
  name: string;
  /** Function body snippet, capped at ~1KB. */
  snippet: string;
  /** Human-readable matching reason (regex/heuristic label). */
  reason: string;
  /** `from "..."` specifiers extracted from the top of the file. */
  importedFrom: string[];
}

export interface DiscoverRiskyInput {
  projectRoot: string;
  fileTree: readonly string[];
  readFile: (relPath: string) => Promise<string>;
  /** Global cap on candidates returned. Defaults to 30. */
  maxFunctions?: number;
}

interface CategoryRule {
  category: RiskCategory;
  /** Matches on function name only. */
  nameRegex?: RegExp;
  reason: string;
}

const NAME_RULES: readonly CategoryRule[] = [
  {
    category: 'auth',
    nameRegex:
      /^(login|signIn|signUp|register|resetPassword|verifyEmail|verifyOtp|createSession|setSession|issueToken|verifyToken|hashPassword|comparePassword)/i,
    reason: '함수명이 인증 관련 동작(login/signUp/verify*/token 등)을 시사합니다.',
  },
  {
    category: 'payment',
    nameRegex:
      /(charge|refund|createPayment|capturePayment|cancelPayment|stripe|toss|iamport|webhook)/i,
    reason: '함수명이 결제/웹훅(charge/refund/stripe/toss/iamport 등) 동작을 시사합니다.',
  },
  {
    category: 'delete',
    nameRegex: /^(delete|remove|drop|purge|destroy|wipe|clear)[A-Z]/,
    reason: '함수명이 데이터 삭제(delete*/remove*/purge* 등) 동작을 시사합니다.',
  },
  {
    category: 'pii',
    nameRegex: /(savePhone|saveEmail|saveAddress|updatePii|exportUser)/i,
    reason: '함수명이 PII 저장/내보내기(savePhone/saveEmail/exportUser 등) 동작을 시사합니다.',
  },
];

const PRISMA_MUTATION_REGEX =
  /\.(update|delete|deleteMany|updateMany|createMany)\s*\(/;
const TRANSACTION_REGEX = /\.\$transaction\s*\(|transaction\s*\(|db\.transaction\b/;
const USE_GUARDS_REGEX = /@UseGuards\s*\(/;
const EXPORT_DEFAULT_FUNCTION_REGEX =
  /export\s+default\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)?/;

const FUNCTION_PATTERNS: ReadonlyArray<{ regex: RegExp; nameGroup: number }> = [
  { regex: /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g, nameGroup: 1 },
  {
    regex: /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/g,
    nameGroup: 1,
  },
  { regex: /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g, nameGroup: 1 },
];

const TEST_PATH_REGEX = /(\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$|__tests__\/)/;
const CODE_FILE_REGEX = /\.[cm]?[jt]sx?$/;
const MAX_BODY_LINES = 200;
const MAX_SNIPPET_BYTES = 1024;
const MAX_PER_FILE = 5;
const DEFAULT_MAX = 30;

interface FunctionMatch {
  name: string;
  startLine: number;
  startIndex: number;
}

function isAuthBoundaryFile(relPath: string): boolean {
  return /(^|\/)(middleware)\.(?:[cm]?[jt]sx?)$/.test(relPath);
}

function extractImports(content: string): string[] {
  const lines = content.split(/\r?\n/).slice(0, 30);
  const out: string[] = [];
  const importRegex = /from\s+['"]([^'"]+)['"]/;
  for (const line of lines) {
    const m = importRegex.exec(line);
    if (m && m[1]) out.push(m[1]);
  }
  return out;
}

function findFunctions(content: string): FunctionMatch[] {
  const matches: FunctionMatch[] = [];
  const seen = new Set<string>();
  for (const { regex, nameGroup } of FUNCTION_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      const name = m[nameGroup];
      if (!name) continue;
      const key = `${name}@${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const startLine = content.slice(0, m.index).split(/\r?\n/).length;
      matches.push({ name, startLine, startIndex: m.index });
    }
  }
  matches.sort((a, b) => a.startIndex - b.startIndex);
  return matches;
}

function extractBody(content: string, startLine: number): string {
  const lines = content.split(/\r?\n/);
  const endLine = Math.min(lines.length, startLine + MAX_BODY_LINES);
  const slice: string[] = [];
  let braceSeen = false;
  for (let i = startLine - 1; i < endLine; i++) {
    const line = lines[i] ?? '';
    slice.push(line);
    if (!braceSeen && line.includes('{')) braceSeen = true;
    if (braceSeen && /^}/.test(line)) break;
  }
  let joined = slice.join('\n');
  if (joined.length > MAX_SNIPPET_BYTES) {
    joined = joined.slice(0, MAX_SNIPPET_BYTES) + '\n/* ... truncated ... */';
  }
  return joined;
}

function classifyByName(name: string): CategoryRule | null {
  for (const rule of NAME_RULES) {
    if (rule.nameRegex && rule.nameRegex.test(name)) return rule;
  }
  return null;
}

function classifyBody(body: string): CategoryRule | null {
  if (USE_GUARDS_REGEX.test(body)) {
    return {
      category: 'auth-boundary',
      reason: 'NestJS @UseGuards 데코레이터가 사용된 인증 경계 함수입니다.',
    };
  }
  if (PRISMA_MUTATION_REGEX.test(body) && !TRANSACTION_REGEX.test(body)) {
    return {
      category: 'data-mutation',
      reason:
        'prisma/drizzle 다중-행 변경(update/delete/createMany 등) 호출이 트랜잭션 없이 사용되었습니다.',
    };
  }
  return null;
}

function classifyMiddleware(
  content: string,
  match: FunctionMatch,
  relPath: string,
): CategoryRule | null {
  if (!isAuthBoundaryFile(relPath)) return null;
  const slice = content.slice(Math.max(0, match.startIndex - 80), match.startIndex + 40);
  if (EXPORT_DEFAULT_FUNCTION_REGEX.test(slice) || /^middleware$/i.test(match.name)) {
    return {
      category: 'auth-boundary',
      reason: 'middleware 파일의 export default 함수는 인증 경계로 동작할 가능성이 높습니다.',
    };
  }
  return null;
}

export async function discoverRiskyFunctions(
  input: DiscoverRiskyInput,
): Promise<RiskyFunction[]> {
  const cap = input.maxFunctions ?? DEFAULT_MAX;
  const out: RiskyFunction[] = [];

  const candidateFiles = input.fileTree.filter(
    (p) => CODE_FILE_REGEX.test(p) && !TEST_PATH_REGEX.test(p),
  );

  for (const relPath of candidateFiles) {
    if (out.length >= cap) break;

    let content: string;
    try {
      content = await input.readFile(relPath);
    } catch {
      continue;
    }
    if (!content) continue;

    const imports = extractImports(content);
    const functions = findFunctions(content);
    let perFile = 0;

    for (const fn of functions) {
      if (perFile >= MAX_PER_FILE) break;
      if (out.length >= cap) break;

      const body = extractBody(content, fn.startLine);

      const rule =
        classifyByName(fn.name) ??
        classifyMiddleware(content, fn, relPath) ??
        classifyBody(body);

      if (!rule) continue;

      out.push({
        category: rule.category,
        path: relPath,
        line: fn.startLine,
        name: fn.name,
        snippet: body,
        reason: rule.reason,
        importedFrom: imports,
      });
      perFile++;
    }
  }

  return out;
}
