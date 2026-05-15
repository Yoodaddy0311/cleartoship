// Firebase Client SDK — runs in the browser only.
// Server-side code must use lib/firebase/admin.ts.

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let _emulatorsConnected = false;

function ensureApp(): FirebaseApp {
  if (_app) return _app;
  const existing = getApps()[0];
  _app = existing ?? initializeApp(firebaseConfig);
  return _app;
}

function maybeConnectEmulators(): void {
  if (_emulatorsConnected) return;
  if (typeof window === 'undefined') return;
  if (process.env.NEXT_PUBLIC_USE_EMULATORS !== '1') return;
  if (_auth) connectAuthEmulator(_auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  if (_db) connectFirestoreEmulator(_db, '127.0.0.1', 8080);
  if (_storage) connectStorageEmulator(_storage, '127.0.0.1', 9199);
  _emulatorsConnected = true;
}

export function getClientAuth(): Auth {
  if (!_auth) _auth = getAuth(ensureApp());
  maybeConnectEmulators();
  return _auth;
}

export function getClientFirestore(): Firestore {
  if (!_db) _db = getFirestore(ensureApp());
  maybeConnectEmulators();
  return _db;
}

export function getClientStorage(): FirebaseStorage {
  if (!_storage) _storage = getStorage(ensureApp());
  maybeConnectEmulators();
  return _storage;
}
