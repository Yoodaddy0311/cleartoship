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

// Firestore Admin/Client SDKs reuse the same `.update()` / `.delete()` verb
// names as Prisma/Drizzle but the semantics (single document mutation on a
// DocumentReference / WriteBatch) are unrelated to "untransactioned multi-row
// ORM write". If any of these specifiers appear in the file's imports we
// suppress PRISMA_MUTATION_REGEX matches to avoid the false positive class
// reported in BUG-3 (firestore writers misclassified as data-mutation).
const FIRESTORE_IMPORT_REGEX =
  /^(?:firebase-admin(?:\/.*)?|firebase(?:\/.*)?|@firebase\/firestore|@google-cloud\/firestore)$/;

function hasFirestoreImport(imports: readonly string[]): boolean {
  return imports.some((spec) => FIRESTORE_IMPORT_REGEX.test(spec));
}

// BUG-3 round 2: require a *positive* ORM import signal before classifying a
// `.update()/.delete()` body as data-mutation. Without this guard we matched
// unrelated `Set.prototype.delete()` / `Map.prototype.delete()` calls in UI
// helpers as if they were Prisma multi-row writes.
const PRISMA_ORM_IMPORT_REGEX =
  /^(?:@prisma\/client(?:\/.*)?|prisma(?:\/.*)?|drizzle-orm(?:\/.*)?)$/;

function hasPrismaOrmImport(imports: readonly string[]): boolean {
  return imports.some((spec) => PRISMA_ORM_IMPORT_REGEX.test(spec));
}

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

// Compile-output directories — always emitted by tsc/webpack/Next and never the
// source of truth. Scanning them produces duplicate matches against the same
// logical function (e.g., `functions/lib/triggers/foo.js` duplicates
// `functions/src/triggers/foo.ts`). Match path components, not substrings, so
// names like `myliberty/` don't accidentally hit.
const BUILD_OUTPUT_DIR_REGEX =
  /(^|\/)(dist|build|out|coverage|\.next|\.turbo|\.cache|\.vercel|\.firebase|__pycache__)\//;

// `lib/` is ambiguous — it can be a compile output (e.g., `functions/lib/`) or
// a legitimate source directory (e.g., `apps/web/src/lib/`, `packages/x/src/lib/`).
// Heuristic: treat `lib/` as compile-output ONLY when it sits at the top level
// of a package (no `src/` ancestor in the same package). Concretely:
//   - `lib/foo.js`               → output (top-level lib)
//   - `functions/lib/foo.js`     → output (package-root lib)
//   - `packages/x/lib/foo.js`    → output (package-root lib)
//   - `apps/web/src/lib/foo.ts`  → source (under src/)
//   - `src/lib/utils.ts`         → source (under src/)
function isCompileOutputLibPath(relPath: string): boolean {
  // Has a `lib/` segment AND no `src/` segment appearing before it.
  const parts = relPath.split('/');
  const libIdx = parts.indexOf('lib');
  if (libIdx === -1) return false;
  // Any `src` segment before the lib segment means this is a source path.
  for (let i = 0; i < libIdx; i++) {
    if (parts[i] === 'src') return false;
  }
  return true;
}

function isExcludedPath(relPath: string): boolean {
  if (BUILD_OUTPUT_DIR_REGEX.test('/' + relPath)) return true;
  if (isCompileOutputLibPath(relPath)) return true;
  return false;
}

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

// O4: extractImports previously capped at 30 lines, which missed transpiled
// bundles or files with large import blocks (npm workspace outputs, generated
// code). The scan now walks forward dynamically — counting consecutive
// "non-import-like" code lines as a soft terminator — with a hard 200-line
// safety bound to keep this O(n) and bounded for pathological inputs.
const IMPORT_SCAN_MAX_LINES = 200;
const IMPORT_SCAN_NONIMPORT_RUN_LIMIT = 5;
const IMPORT_DIRECTIVE_REGEX =
  /^(?:["']use strict["'];?|["']use client["'];?|["']use server["'];?)\s*$/;

function extractImports(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const scanLimit = Math.min(lines.length, IMPORT_SCAN_MAX_LINES);
  const out: string[] = [];
  const esmImportRegex = /from\s+['"]([^'"]+)['"]/;
  // BUG-3 round 2: CommonJS `const X = require('...');` / `var X = require('...');`
  // / bare `require('...')` — without this, transpiled firebase-admin/firestore
  // requires bypassed the Firestore negative guard.
  const cjsRequireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/;
  let nonImportRun = 0;
  for (let i = 0; i < scanLimit; i++) {
    const line = lines[i] ?? '';
    const esm = esmImportRegex.exec(line);
    if (esm && esm[1]) out.push(esm[1]);
    const cjs = cjsRequireRegex.exec(line);
    if (cjs && cjs[1]) out.push(cjs[1]);

    const trimmed = line.trim();
    const isImportLike =
      esm !== null ||
      cjs !== null ||
      trimmed === '' ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('*/') ||
      IMPORT_DIRECTIVE_REGEX.test(trimmed);

    if (isImportLike) {
      nonImportRun = 0;
    } else {
      nonImportRun++;
      if (nonImportRun >= IMPORT_SCAN_NONIMPORT_RUN_LIMIT) break;
    }
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
      // O3 dedup: FUNCTION_PATTERNS overlap — `export function foo` is matched
      // by both pattern[0] (m.index points at `export`) and pattern[2]
      // (m.index points at `function`). Keying on raw `m.index` lets the same
      // declaration through twice. Key on the absolute position of the NAME
      // token instead: it is stable across patterns and unique per function.
      const nameOffsetInMatch = m[0].indexOf(name);
      const nameAbsoluteIndex = m.index + nameOffsetInMatch;
      const key = `${name}@${nameAbsoluteIndex}`;
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

function classifyBody(body: string, imports: readonly string[]): CategoryRule | null {
  if (USE_GUARDS_REGEX.test(body)) {
    return {
      category: 'auth-boundary',
      reason: 'NestJS @UseGuards 데코레이터가 사용된 인증 경계 함수입니다.',
    };
  }
  if (
    PRISMA_MUTATION_REGEX.test(body) &&
    !TRANSACTION_REGEX.test(body) &&
    hasPrismaOrmImport(imports) &&
    !hasFirestoreImport(imports)
  ) {
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
    (p) => CODE_FILE_REGEX.test(p) && !TEST_PATH_REGEX.test(p) && !isExcludedPath(p),
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
        classifyBody(body, imports);

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
