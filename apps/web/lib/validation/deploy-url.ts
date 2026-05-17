// Backwards-compat shim: the real implementation now lives in
// @cleartoship/audit-core so the worker (which can't import from apps/web)
// can use the same SSRF defense at the VALIDATE_INPUT pipeline step.
// All existing `@/lib/validation/deploy-url` imports continue to work.

export {
  parseDeployUrl,
  isValidDeployUrl,
  validateDeployUrl,
  type ParsedDeployUrl,
} from '@cleartoship/audit-core';
