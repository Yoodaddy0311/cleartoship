// Anonymous auth bootstrap for the MVP "log-in-free audit" flow described in
// the PRD. firestore.rules requires request.auth != null on every create, so
// without a uid the AuditStartForm submission would fail.
//
// Strategy (Option A): on first form mount, ensure a Firebase anonymous user
// exists. The resulting uid satisfies isSignedIn() in rules and becomes the
// AuditRun.ownerId. Later, the same anonymous user can be upgraded to a
// GitHub-linked account via linkWithCredential — the uid is preserved, so
// past runs remain owned by them.
//
// Anonymous user cleanup (30-day idle) is intentionally NOT handled here;
// it belongs in a dailyCleanup Cloud Function (tracked separately).

'use client';

import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from 'firebase/auth';
import { getClientAuth } from './client';

export interface AnonymousAuthState {
  user: User | null;
  uid: string | null;
  initializing: boolean;
  error: Error | null;
}

const INITIAL: AnonymousAuthState = {
  user: null,
  uid: null,
  initializing: true,
  error: null,
};

/**
 * Subscribes to auth state and, if no user is present after the first
 * snapshot, signs in anonymously. Returns the current state so the caller
 * can gate UI (e.g. disable submit while initializing) and surface errors.
 *
 * Safe to call from multiple components — Firebase deduplicates the
 * underlying auth state listener.
 */
export function useEnsureAnonymousAuth(): AnonymousAuthState {
  const [state, setState] = useState<AnonymousAuthState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    const auth = getClientAuth();
    let signInInFlight = false;

    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        if (cancelled) return;
        if (user) {
          setState({ user, uid: user.uid, initializing: false, error: null });
          return;
        }
        // No user — sign in anonymously exactly once.
        if (signInInFlight) return;
        signInInFlight = true;
        signInAnonymously(auth)
          .then((cred) => {
            if (cancelled) return;
            setState({
              user: cred.user,
              uid: cred.user.uid,
              initializing: false,
              error: null,
            });
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            const error = err instanceof Error ? err : new Error(String(err));
            setState({ user: null, uid: null, initializing: false, error });
          })
          .finally(() => {
            signInInFlight = false;
          });
      },
      (err) => {
        if (cancelled) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setState({ user: null, uid: null, initializing: false, error });
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return state;
}

/**
 * Imperative variant — useful from server actions / event handlers that need
 * a uid right now without a React render. If a user is already signed in,
 * returns it immediately; otherwise mints an anonymous user.
 */
export async function ensureAnonymousUser(): Promise<User> {
  const auth = getClientAuth();
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}
