// Firestore document size guard — shared across apps/web and workers/audit-worker.
// Firestore 단일 doc 한도 1MiB (1_048_576 bytes). 직렬화 오버헤드와 메타데이터 여유분
// 100KB 빼고 900_000 default. Sprint 1 consolidation: apps/web/lib/validation/size-guard.ts
// 와 workers/audit-worker/src/firestore/size-guard.ts 의 byte-identical 중복을 본 모듈로
// 통합 (Phase 5 IMPROVE).

export const FIRESTORE_DOC_MAX_BYTES = 1_048_576;
export const FIRESTORE_DOC_SAFE_BYTES = 900_000;

export type SizeGuardResult =
  | { ok: true; size: number }
  | { ok: false; size: number; max: number };

/**
 * Returns the UTF-8 byte length of an arbitrary payload after JSON serialization.
 * Strings are measured directly to avoid the cost of JSON.stringify wrapping in quotes.
 */
export function measureByteSize(payload: unknown): number {
  if (typeof payload === 'string') {
    return Buffer.byteLength(payload, 'utf8');
  }
  return Buffer.byteLength(JSON.stringify(payload) ?? '', 'utf8');
}

/**
 * Validates that a payload's serialized size is within Firestore's safe write limit.
 * `maxBytes` defaults to FIRESTORE_DOC_SAFE_BYTES (900KB) — leaves ~148KB margin for
 * Firestore overhead, indexed field metadata, and server-stamped fields.
 */
export function validateDocumentSize<T>(
  payload: T,
  maxBytes: number = FIRESTORE_DOC_SAFE_BYTES,
): SizeGuardResult {
  const size = measureByteSize(payload);
  if (size > maxBytes) {
    return { ok: false, size, max: maxBytes };
  }
  return { ok: true, size };
}

/**
 * Truncates a markdown string to fit within maxBytes, appending a Korean truncation marker.
 * Used as Sprint 0 fallback for AuditReport.markdown / ImprovementPRD.markdown.
 * Sprint 1+: large payloads should be offloaded to Cloud Storage instead.
 */
export function truncateMarkdown(markdown: string, maxBytes: number = FIRESTORE_DOC_SAFE_BYTES): string {
  const marker = '\n\n... [잘림: Firestore 1MB 한도 초과로 일부 내용 생략됨]';
  const markerBytes = Buffer.byteLength(marker, 'utf8');
  const currentBytes = Buffer.byteLength(markdown, 'utf8');
  if (currentBytes <= maxBytes) return markdown;

  const budget = Math.max(0, maxBytes - markerBytes);
  // UTF-8 멀티바이트 문자 경계에서 잘리지 않도록 Buffer.slice 후 decode.
  const buf = Buffer.from(markdown, 'utf8');
  // 마지막 byte가 멀티바이트 시퀀스 중간이면 안전 위치까지 뒤로 이동.
  let cut = Math.min(budget, buf.length);
  // Under noUncheckedIndexedAccess, `buf[cut]` is number | undefined. Treat
  // undefined (past-the-end) as a safe boundary so the loop terminates.
  while (cut > 0) {
    const byte = buf[cut];
    if (byte === undefined || (byte & 0xc0) !== 0x80) break;
    cut -= 1;
  }
  return buf.subarray(0, cut).toString('utf8') + marker;
}
