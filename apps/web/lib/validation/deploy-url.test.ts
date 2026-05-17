import { describe, expect, it } from 'vitest';
import { isValidDeployUrl, parseDeployUrl } from '@cleartoship/audit-core';

describe('parseDeployUrl — protocol validation', () => {
  it('accepts https URLs', () => {
    const r = parseDeployUrl('https://example.com');
    expect(r.isHttps).toBe(true);
    expect(r.warning).toBeNull();
  });

  it('accepts http URLs but warns', () => {
    const r = parseDeployUrl('http://example.com');
    expect(r.isHttps).toBe(false);
    expect(r.warning).toMatch(/HTTPS/);
  });

  it('rejects ftp protocol', () => {
    expect(() => parseDeployUrl('ftp://example.com')).toThrow(/http 또는 https/);
  });

  it('rejects javascript: URLs', () => {
    expect(() => parseDeployUrl('javascript:alert(1)')).toThrow(/http 또는 https/);
  });

  it('rejects file:// URLs', () => {
    expect(() => parseDeployUrl('file:///etc/passwd')).toThrow(/http 또는 https/);
  });

  it('rejects malformed URLs', () => {
    expect(() => parseDeployUrl('not a url')).toThrow(/형식이 올바르지 않습니다/);
  });
});

describe('parseDeployUrl — IPv4 SSRF', () => {
  it('rejects 127.0.0.1 loopback', () => {
    expect(() => parseDeployUrl('http://127.0.0.1/')).toThrow(/사설 IP/);
  });

  it('rejects 127.x.y.z (entire /8 loopback)', () => {
    expect(() => parseDeployUrl('http://127.255.255.254/')).toThrow(/사설 IP/);
  });

  it('rejects 10.0.0.0/8 RFC1918', () => {
    expect(() => parseDeployUrl('http://10.0.0.5/')).toThrow(/사설 IP/);
  });

  it('rejects 172.16.0.0/12 RFC1918', () => {
    expect(() => parseDeployUrl('http://172.16.5.1/')).toThrow(/사설 IP/);
    expect(() => parseDeployUrl('http://172.31.0.0/')).toThrow(/사설 IP/);
  });

  it('accepts 172.32.0.0 (outside RFC1918 /12)', () => {
    expect(() => parseDeployUrl('http://172.32.0.1/')).not.toThrow();
  });

  it('rejects 192.168.0.0/16 RFC1918', () => {
    expect(() => parseDeployUrl('http://192.168.1.1/')).toThrow(/사설 IP/);
  });

  it('rejects 169.254.169.254 cloud metadata', () => {
    expect(() => parseDeployUrl('http://169.254.169.254/latest/meta-data/')).toThrow(/사설 IP/);
  });

  it('rejects 169.254.x.x link-local range', () => {
    expect(() => parseDeployUrl('http://169.254.0.1/')).toThrow(/사설 IP/);
  });

  it('rejects 0.0.0.0', () => {
    expect(() => parseDeployUrl('http://0.0.0.0/')).toThrow(/사설 IP/);
  });

  it('rejects 100.64.0.0/10 CGNAT', () => {
    expect(() => parseDeployUrl('http://100.64.0.1/')).toThrow(/사설 IP/);
    expect(() => parseDeployUrl('http://100.127.0.0/')).toThrow(/사설 IP/);
  });

  it('accepts 100.128.0.0 (outside CGNAT)', () => {
    expect(() => parseDeployUrl('http://100.128.0.0/')).not.toThrow();
  });
});

describe('parseDeployUrl — IPv6 SSRF', () => {
  it('rejects ::1 loopback', () => {
    expect(() => parseDeployUrl('http://[::1]/')).toThrow(/사설 IP/);
  });

  it('rejects expanded loopback 0:0:0:0:0:0:0:1', () => {
    expect(() => parseDeployUrl('http://[0:0:0:0:0:0:0:1]/')).toThrow(/사설 IP/);
  });

  it('rejects :: unspecified', () => {
    expect(() => parseDeployUrl('http://[::]/')).toThrow(/사설 IP/);
  });

  it('rejects fc00::/7 unique-local (fc prefix)', () => {
    expect(() => parseDeployUrl('http://[fc00::1]/')).toThrow(/사설 IP/);
  });

  it('rejects fd00::/7 unique-local (fd prefix)', () => {
    expect(() => parseDeployUrl('http://[fdab::1]/')).toThrow(/사설 IP/);
  });

  it('rejects fe80::/10 link-local', () => {
    expect(() => parseDeployUrl('http://[fe80::1]/')).toThrow(/사설 IP/);
  });

  // Sprint 1 hardening: isPrivateIPv6 now peels both the dotted form
  // (::ffff:127.0.0.1, rare — most parsers normalize it away) and the hex
  // form (::ffff:7f00:1) that WHATWG URL emits after normalization.
  it('rejects ::ffff:127.0.0.1 IPv4-mapped loopback (dotted form input)', () => {
    expect(() => parseDeployUrl('http://[::ffff:127.0.0.1]/')).toThrow(/사설 IP/);
  });

  it('rejects ::ffff:10.0.0.1 IPv4-mapped RFC1918 (dotted form input)', () => {
    expect(() => parseDeployUrl('http://[::ffff:10.0.0.1]/')).toThrow(/사설 IP/);
  });

  it('rejects ::ffff:0a00:0001 (hex form = 10.0.0.1)', () => {
    expect(() => parseDeployUrl('http://[::ffff:0a00:0001]/')).toThrow(/사설 IP/);
  });

  it('rejects ::ffff:c0a8:0101 (hex form = 192.168.1.1)', () => {
    expect(() => parseDeployUrl('http://[::ffff:c0a8:0101]/')).toThrow(/사설 IP/);
  });

  it('rejects ::ffff:7f00:0001 (hex form = 127.0.0.1 loopback)', () => {
    expect(() => parseDeployUrl('http://[::ffff:7f00:0001]/')).toThrow(/사설 IP/);
  });

  it('rejects ::ffff:a9fe:a9fe (hex form = 169.254.169.254 metadata)', () => {
    expect(() => parseDeployUrl('http://[::ffff:a9fe:a9fe]/')).toThrow(/사설 IP/);
  });

  it('accepts ::ffff:0808:0808 (hex form = 8.8.8.8 public DNS)', () => {
    expect(() => parseDeployUrl('http://[::ffff:0808:0808]/')).not.toThrow();
  });

  it('accepts public IPv6 like 2001:4860::', () => {
    expect(() => parseDeployUrl('http://[2001:4860::1]/')).not.toThrow();
  });
});

describe('parseDeployUrl — reserved hostnames', () => {
  it('rejects localhost', () => {
    expect(() => parseDeployUrl('http://localhost/')).toThrow(/사설 IP/);
  });

  it('rejects localhost.localdomain', () => {
    expect(() => parseDeployUrl('http://localhost.localdomain/')).toThrow(/사설 IP/);
  });

  it('rejects metadata.google.internal', () => {
    expect(() => parseDeployUrl('http://metadata.google.internal/')).toThrow(/사설 IP/);
  });

  it('rejects bare metadata', () => {
    expect(() => parseDeployUrl('http://metadata/')).toThrow(/사설 IP/);
  });

  it('rejects *.local mDNS', () => {
    expect(() => parseDeployUrl('http://my-printer.local/')).toThrow(/사설 IP/);
  });

  it('rejects bare local', () => {
    expect(() => parseDeployUrl('http://local/')).toThrow(/사설 IP/);
  });

  it('is case-insensitive for reserved hostnames', () => {
    expect(() => parseDeployUrl('http://LocalHost/')).toThrow(/사설 IP/);
    expect(() => parseDeployUrl('http://METADATA.google.internal/')).toThrow(/사설 IP/);
  });
});

describe('parseDeployUrl — valid public URLs', () => {
  it('accepts a normal public https URL', () => {
    const r = parseDeployUrl('https://www.example.com/path?q=1');
    expect(r.hostname).toBe('www.example.com');
    expect(r.isHttps).toBe(true);
    expect(r.warning).toBeNull();
  });

  it('accepts subdomains', () => {
    const r = parseDeployUrl('https://my-app-staging.vercel.app');
    expect(r.hostname).toBe('my-app-staging.vercel.app');
  });

  it('trims surrounding whitespace', () => {
    const r = parseDeployUrl('   https://example.com  ');
    expect(r.hostname).toBe('example.com');
  });

  it('preserves query string in returned url', () => {
    const r = parseDeployUrl('https://example.com/api?x=1&y=2');
    expect(r.url).toContain('x=1');
  });
});

describe('isValidDeployUrl', () => {
  it('returns true for valid URL', () => {
    expect(isValidDeployUrl('https://example.com')).toBe(true);
  });

  it('returns false for SSRF target', () => {
    expect(isValidDeployUrl('http://127.0.0.1/')).toBe(false);
  });

  it('returns false for malformed input', () => {
    expect(isValidDeployUrl('not-a-url')).toBe(false);
  });

  it('returns false for non-http(s) protocols', () => {
    expect(isValidDeployUrl('ws://example.com')).toBe(false);
  });
});
