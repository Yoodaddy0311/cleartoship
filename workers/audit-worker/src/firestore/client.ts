// Firestore Admin client for the worker (singleton).
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let _app: App | null = null;

export function getFirestoreClient(): Firestore {
  if (!_app) {
    const existing = getApps()[0];
    if (existing) {
      _app = existing;
    } else {
      const sa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (sa) {
        const parsed = JSON.parse(sa) as Record<string, string>;
        _app = initializeApp({
          credential: cert({
            projectId: parsed.project_id,
            clientEmail: parsed.client_email,
            privateKey: (parsed.private_key ?? '').replace(/\\n/g, '\n'),
          }),
          projectId: parsed.project_id,
        });
      } else {
        _app = initializeApp({
          credential: applicationDefault(),
          projectId: process.env.GCP_PROJECT_ID ?? undefined,
        });
      }
    }
  }
  return getFirestore(_app);
}
