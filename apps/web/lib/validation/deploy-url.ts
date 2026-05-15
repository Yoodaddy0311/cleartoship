// Lightweight validation for user-provided deploy URLs.
//
// Goal: prevent SSRF by rejecting URLs whose host resolves (or literally is)
// inside private/loopback/link-local ranges or the cloud metadata endpoint
// (169.254.169.254, metadata.google.internal). Without this guard, a worker
// that fetches the deployUrl could be coerced into scanning internal infra
// or exfiltrating instance metadata.
//
// Two entry points:
//  - parseDeployUrl(input): synchronous, performs literal-host checks. Catches
//    IP-literal SSRF (the dominant attack vector) without DNS. Safe to call
//    from synchronous code paths.
//  - validateDeployUrl(input): async, additionally resolves the hostname via
//    DNS and rejects if any resolved address is in a reserved range.

import { promises as dnsPromises } from 'node:dns';
import { isIP } from 'node:net';

export interface ParsedDeployUrl {
  url: string;
  hostname: string;
  isHttps: boolean;
  warning: string | null;
}

// Hostnames we always reject (case-insensitive exact match).
const RESERVED_HOSTNAMES = new Set<string>([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
]);

function isPrivateIPv4(addr: string): boolean {
  // Validate it's a numeric IPv4 first.
  if (isIP(addr) !== 4) return false;
  const parts = addr.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local, includes GCP/AWS metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 0.0.0.0/8 (unspecified / wildcard)
  if (a === 0) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

// RFC 4291 §2.5.5.2 IPv4-mapped IPv6 in hex form: `::ffff:HHHH:HHHH`.
// WHATWG URL parsing normalizes `::ffff:127.0.0.1` to this hex form, so we
// must also peel hex-form mapped addresses back to dotted IPv4 to apply the
// private-range check.
const IPV6_MAPPED_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;
function extractMappedIPv4(host: string): string | null {
  const m = IPV6_MAPPED_HEX.exec(host);
  if (!m || !m[1] || !m[2]) return null;
  const high = parseInt(m[1], 16);
  const low = parseInt(m[2], 16);
  if (Number.isNaN(high) || Number.isNaN(low) || high > 0xffff || low > 0xffff) return null;
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

function isPrivateIPv6(addr: string): boolean {
  if (isIP(addr) !== 6) return false;
  const lower = addr.toLowerCase();
  // ::1 loopback (any form)
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  // :: unspecified
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
  // fc00::/7 unique-local (fc.. or fd..)
  if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return true;
  // fe80::/10 link-local
  if (/^fe[89ab][0-9a-f]:/i.test(lower)) return true;
  // IPv4-mapped dotted form (::ffff:10.0.0.1) — peel and recheck.
  const mappedDotted = lower.match(/^::ffff:([0-9.]+)$/);
  if (mappedDotted && mappedDotted[1]) return isPrivateIPv4(mappedDotted[1]);
  // IPv4-mapped hex form (::ffff:0a00:0001 == 10.0.0.1) — see RFC 4291.
  const mappedHex = extractMappedIPv4(lower);
  if (mappedHex) return isPrivateIPv4(mappedHex);
  return false;
}

function hostIsReserved(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (RESERVED_HOSTNAMES.has(h)) return true;
  // Reject `.local` mDNS domain wholesale.
  if (h === 'local' || h.endsWith('.local')) return true;
  const kind = isIP(h);
  if (kind === 4) return isPrivateIPv4(h);
  if (kind === 6) return isPrivateIPv6(h);
  return false;
}

export function parseDeployUrl(input: string): ParsedDeployUrl {
  const trimmed = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`배포 URL 형식이 올바르지 않습니다 (입력: ${trimmed}).`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('배포 URL은 http 또는 https 만 허용됩니다.');
  }
  if (hostIsReserved(parsed.hostname)) {
    throw new Error('사설 IP·loopback·메타데이터 호스트는 분석 대상이 될 수 없습니다.');
  }
  const isHttps = parsed.protocol === 'https:';
  return {
    url: parsed.toString(),
    hostname: parsed.hostname,
    isHttps,
    warning: isHttps ? null : 'HTTPS가 아닌 URL 입니다. 가능한 경우 HTTPS로 배포하세요.',
  };
}

export function isValidDeployUrl(input: string): boolean {
  try {
    parseDeployUrl(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Async variant: performs the synchronous host check, then resolves the
 * hostname via DNS and rejects if any resolved address falls inside a
 * reserved range. Use in server-side code paths where the extra DNS lookup
 * is acceptable.
 */
export async function validateDeployUrl(input: string): Promise<ParsedDeployUrl> {
  const parsed = parseDeployUrl(input);
  // If the hostname is already an IP literal, parseDeployUrl has covered it.
  if (isIP(parsed.hostname) !== 0) return parsed;

  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await dnsPromises.lookup(parsed.hostname, { all: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`배포 URL 호스트를 해석할 수 없습니다: ${parsed.hostname} (${message}).`);
  }

  for (const { address, family } of addrs) {
    if (family === 4 && isPrivateIPv4(address)) {
      throw new Error(
        `배포 URL 호스트 ${parsed.hostname}이(가) 사설/내부 IP로 해석됩니다: ${address}.`,
      );
    }
    if (family === 6 && isPrivateIPv6(address)) {
      throw new Error(
        `배포 URL 호스트 ${parsed.hostname}이(가) 사설/내부 IPv6로 해석됩니다: ${address}.`,
      );
    }
  }
  return parsed;
}
