// Cloud Functions (2nd gen) entrypoint.
// Exports are wired by name in firebase.json — adding a new export here is
// sufficient to deploy it.

import { initializeApp, getApps } from 'firebase-admin/app';

// Admin SDK is initialized once at cold start.
if (getApps().length === 0) {
  initializeApp();
}

export { onAuditRunCreated } from './triggers/on-audit-run-created.js';
export { dailyCleanup } from './triggers/daily-cleanup.js';
