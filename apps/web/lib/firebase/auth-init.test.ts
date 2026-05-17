// Unit tests for getIdToken / ensureAnonymousUser.
// firebase/auth + ./client are mocked so we drive currentUser state directly.
// The React hook (useEnsureAnonymousAuth) requires jsdom + @testing-library/react,
// neither of which is configured in this Node-environment test suite, so it is
// not exercised here.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getClientAuthMock, signInAnonymouslyMock, onAuthStateChangedMock } =
  vi.hoisted(() => ({
    getClientAuthMock: vi.fn(),
    signInAnonymouslyMock: vi.fn(),
    onAuthStateChangedMock: vi.fn(),
  }));

vi.mock('./client', () => ({
  getClientAuth: getClientAuthMock,
}));

vi.mock('firebase/auth', () => ({
  signInAnonymously: signInAnonymouslyMock,
  onAuthStateChanged: onAuthStateChangedMock,
}));

beforeEach(() => {
  vi.resetModules();
  getClientAuthMock.mockReset();
  signInAnonymouslyMock.mockReset();
  onAuthStateChangedMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getIdToken', () => {
  it('returns null when running on the server (no window)', async () => {
    vi.stubGlobal('window', undefined);
    const { getIdToken } = await import('./auth-init');

    const out = await getIdToken();

    expect(out).toBeNull();
    expect(getClientAuthMock).not.toHaveBeenCalled();
  });

  it('returns null when no user is currently signed in', async () => {
    vi.stubGlobal('window', {});
    getClientAuthMock.mockReturnValue({
      currentUser: null,
      authStateReady: () => Promise.resolve(),
    });
    const { getIdToken } = await import('./auth-init');

    const out = await getIdToken();

    expect(out).toBeNull();
  });

  it('returns the user-supplied id token when signed in', async () => {
    vi.stubGlobal('window', {});
    const getIdTokenSpy = vi.fn().mockResolvedValue('fake-token-x');
    getClientAuthMock.mockReturnValue({
      currentUser: { getIdToken: getIdTokenSpy },
      authStateReady: () => Promise.resolve(),
    });
    const { getIdToken } = await import('./auth-init');

    const out = await getIdToken();

    expect(out).toBe('fake-token-x');
    expect(getIdTokenSpy).toHaveBeenCalledTimes(1);
  });

  it('returns null (does not throw) when the underlying getIdToken rejects', async () => {
    vi.stubGlobal('window', {});
    getClientAuthMock.mockReturnValue({
      currentUser: {
        getIdToken: vi.fn().mockRejectedValue(new Error('network down')),
      },
      authStateReady: () => Promise.resolve(),
    });
    const { getIdToken } = await import('./auth-init');

    const out = await getIdToken();

    expect(out).toBeNull();
  });

  it('returns null when getClientAuth itself throws', async () => {
    vi.stubGlobal('window', {});
    getClientAuthMock.mockImplementation(() => {
      throw new Error('firebase not initialized');
    });
    const { getIdToken } = await import('./auth-init');

    const out = await getIdToken();

    expect(out).toBeNull();
  });
});

describe('ensureAnonymousUser', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
  });

  it('returns the existing currentUser when one is present', async () => {
    const existing = { uid: 'user-existing' };
    getClientAuthMock.mockReturnValue({ currentUser: existing });
    const { ensureAnonymousUser } = await import('./auth-init');

    const user = await ensureAnonymousUser();

    expect(user).toBe(existing);
    expect(signInAnonymouslyMock).not.toHaveBeenCalled();
  });

  it('mints an anonymous user when currentUser is null', async () => {
    const auth = { currentUser: null };
    getClientAuthMock.mockReturnValue(auth);
    const minted = { uid: 'user-anon' };
    signInAnonymouslyMock.mockResolvedValue({ user: minted });
    const { ensureAnonymousUser } = await import('./auth-init');

    const user = await ensureAnonymousUser();

    expect(user).toBe(minted);
    expect(signInAnonymouslyMock).toHaveBeenCalledWith(auth);
  });

  it('propagates sign-in errors', async () => {
    getClientAuthMock.mockReturnValue({ currentUser: null });
    signInAnonymouslyMock.mockRejectedValue(new Error('auth/quota-exceeded'));
    const { ensureAnonymousUser } = await import('./auth-init');

    await expect(ensureAnonymousUser()).rejects.toThrow('auth/quota-exceeded');
  });
});
