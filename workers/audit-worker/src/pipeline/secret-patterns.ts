// Secret detection patterns + masking helpers.
//
// Security invariant (PRD §11): we MUST NEVER store the raw secret value
// anywhere — only a masked representation that reveals at most the last 4
// characters. `maskSecret()` is the single function that produces the value
// persisted to Firestore; every caller MUST use it.

export interface SecretPattern {
  /** Stable identifier persisted in evidence metadata. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Regex applied per-line. MUST include the secret itself in a capture group #1. */
  regex: RegExp;
}

export const SECRET_PATTERNS: ReadonlyArray<SecretPattern> = [
  {
    id: 'aws-access-key-id',
    label: 'AWS Access Key ID',
    regex: /\b(AKIA[0-9A-Z]{16})\b/,
  },
  {
    id: 'aws-secret-access-key',
    label: 'AWS Secret Access Key',
    regex: /aws[_-]?secret[_-]?access[_-]?key["'\s:=]+([A-Za-z0-9/+=]{40})/i,
  },
  {
    id: 'google-api-key',
    label: 'Google API Key',
    regex: /\b(AIza[0-9A-Za-z\-_]{35})\b/,
  },
  {
    id: 'github-pat',
    label: 'GitHub Personal Access Token',
    regex: /\b(ghp_[A-Za-z0-9]{36})\b/,
  },
  {
    id: 'github-fine-grained-pat',
    label: 'GitHub Fine-Grained Token',
    regex: /\b(github_pat_[A-Za-z0-9_]{60,})\b/,
  },
  {
    id: 'openai-api-key',
    label: 'OpenAI API Key',
    regex: /\b(sk-[A-Za-z0-9]{32,})\b/,
  },
  {
    id: 'slack-token',
    label: 'Slack Token',
    regex: /\b(xox[abprs]-[A-Za-z0-9-]{10,})\b/,
  },
  {
    id: 'stripe-secret-key',
    label: 'Stripe Secret Key',
    regex: /\b(sk_live_[A-Za-z0-9]{24,})\b/,
  },
  {
    id: 'jwt',
    label: 'JSON Web Token',
    regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/,
  },
  {
    id: 'private-key-block',
    label: 'PEM Private Key Header',
    regex: /(-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----)/,
  },
];

/**
 * Returns a masked representation of the secret, exposing only the last 4
 * characters. NEVER returns the raw value. Short secrets are fully redacted.
 */
export function maskSecret(raw: string): string {
  if (!raw) return '***';
  if (raw.length <= 4) return '***';
  const last4 = raw.slice(-4);
  const stars = '*'.repeat(Math.min(28, Math.max(4, raw.length - 4)));
  return `***${stars}${last4}`;
}

export interface SecretHit {
  patternId: string;
  patternLabel: string;
  line: number;
  column: number;
  maskedValue: string;
}

/**
 * Scan a single file's text content for known secret patterns. Returns hits
 * containing only the *masked* value. The raw secret never leaves this
 * function.
 */
export function scanText(content: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pattern of SECRET_PATTERNS) {
      const match = pattern.regex.exec(line);
      if (match && match[1]) {
        hits.push({
          patternId: pattern.id,
          patternLabel: pattern.label,
          line: i + 1,
          column: (match.index ?? 0) + 1,
          maskedValue: maskSecret(match[1]),
        });
      }
    }
  }
  return hits;
}

/**
 * Lightweight heuristic: treat as binary if the first chunk contains a NUL
 * byte. Avoids reading the file with a charset assumption that would corrupt
 * the regex match.
 */
export function looksBinary(buffer: Buffer): boolean {
  const slice = buffer.subarray(0, Math.min(buffer.length, 8192));
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === 0) return true;
  }
  return false;
}
