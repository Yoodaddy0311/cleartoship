// Firebase Admin SDK — server-side only. Never imported by client components.
import { cert, getApps, initializeApp, applicationDefault, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';
import { getAuth, type Auth } from 'firebase-admin/auth';

let _adminApp: App | null = null;

function initAdminApp(): App {
  if (_adminApp) return _adminApp;
  const existing = getApps()[0];
  if (existing) {
    _adminApp = existing;
    return _adminApp;
  }

  const projectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.GCP_PROJECT_ID ?? undefined;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? undefined;

  // Prefer explicit service account JSON via GOOGLE_APPLICATION_CREDENTIALS path,
  // otherwise rely on applicationDefault() (Cloud Run / Functions metadata server).
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    const parsed = JSON.parse(serviceAccountJson) as Record<string, string>;
    _adminApp = initializeApp({
      credential: cert({
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: (parsed.private_key ?? '').replace(/\\n/g, '\n'),
      }),
      projectId: projectId ?? parsed.project_id,
      ...(storageBucket ? { storageBucket } : {}),
    });
    return _adminApp;
  }

  _adminApp = initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
    ...(storageBucket ? { storageBucket } : {}),
  });
  return _adminApp;
}

export function getAdminFirestore(): Firestore {
  return getFirestore(initAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(initAdminApp());
}

export function getAdminStorage(): Storage {
  return getStorage(initAdminApp());
}
