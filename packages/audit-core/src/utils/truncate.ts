// W3.CLN.2 — UTF-8 byte-safe truncation utility.
//
// The coverage-matrix renderer (and several future report sections) needs to
// clip claim text / labels to a byte budget without splitting a multi-byte
// UTF-8 sequence mid-codepoint. JavaScript's native `String.prototype.slice`
// counts UTF-16 code UNITS, which corrupts:
//   - emoji (e.g. '👍' = surrogate pair in UTF-16, 4 bytes in UTF-8)
//   - CJK characters (3 bytes each in UTF-8)
//
// A naive `.slice(0, n)` against a Korean PRD claim at byte boundary n=10
// could either truncate a Hangul syllable mid-byte or — for emoji — leave a
// dangling high surrogate that renders as a tofu box.
//
// This utility:
//   1. Walks the codepoints via `for..of` (iterates by Unicode scalar value,
//      handling surrogate pairs correctly).
//   2. Accumulates UTF-8 byte length using `TextEncoder` (the only
//      spec-compliant UTF-8 encoder in the JS runtime).
//   3. Stops before adding the codepoint that would push past `maxBytes`
//      MINUS the suffix's byte length — so the final string (including the
//      ellipsis) is ALWAYS ≤ `maxBytes`.
//
// Edge cases the test fixture asserts:
//   - empty / null / undefined input → returns '' (never throws)
//   - `maxBytes === 0` → returns '' (even the suffix is dropped — the
//     contract is "no output larger than maxBytes")
//   - input already within budget → returned unchanged (no suffix appended)
//   - suffix longer than `maxBytes` → returns '' (cannot fit the suffix)

const DEFAULT_SUFFIX = '…';

let cachedEncoder: TextEncoder | null = null;
function utf8Bytes(s: string): number {
  // Cache the encoder — `new TextEncoder()` is cheap but called per row in
  // the coverage matrix renderer, so we lazily reuse a single instance.
  if (cachedEncoder === null) cachedEncoder = new TextEncoder();
  return cachedEncoder.encode(s).length;
}

/**
 * Truncate `input` so the returned string's UTF-8 byte length is ≤ `maxBytes`.
 *
 * If truncation is needed, `suffix` (default '…', 3 bytes in UTF-8) is
 * appended — and the resulting string INCLUDING the suffix still fits in
 * `maxBytes`. When even the suffix cannot fit, returns '' rather than a
 * string longer than the budget.
 *
 * Null/undefined input → '' (defensive; coverage-matrix may pass an optional
 * field without an upstream null guard).
 */
export function truncate(
  input: string | null | undefined,
  maxBytes: number,
  suffix: string = DEFAULT_SUFFIX,
): string {
  if (input === null || input === undefined || input === '') return '';
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return '';

  // Fast path: already small enough — no need to walk codepoints.
  const fullBytes = utf8Bytes(input);
  if (fullBytes <= maxBytes) return input;

  const suffixBytes = utf8Bytes(suffix);
  // If even the suffix itself exceeds the budget there is no representable
  // truncation; bail with '' to honor the "never exceed maxBytes" contract.
  if (suffixBytes > maxBytes) return '';

  const budget = maxBytes - suffixBytes;
  if (budget <= 0) return '';

  // Walk codepoints, accumulating bytes. `for..of` over a string iterates
  // Unicode scalar values (surrogate pairs collapse to one step), so an
  // emoji like '👍' is processed atomically — we either include its 4 UTF-8
  // bytes or drop the whole codepoint.
  let acc = '';
  let bytes = 0;
  for (const cp of input) {
    const cpBytes = utf8Bytes(cp);
    if (bytes + cpBytes > budget) break;
    acc += cp;
    bytes += cpBytes;
  }
  // It is possible the loop appended nothing (first codepoint already too
  // large for the budget). In that case `acc === ''` and we return just the
  // suffix — still within maxBytes by the suffixBytes <= maxBytes check.
  return acc + suffix;
}
