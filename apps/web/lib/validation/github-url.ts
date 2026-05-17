// Backwards-compat shim: real implementation lives in @cleartoship/audit-core
// (so the audit worker can share the same parser).

export { parseGitHubUrl, isValidGitHubUrl, type ParsedGitHubUrl } from '@cleartoship/audit-core';
