// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const getMock = vi.fn();
const createEmailPasswordSessionMock = vi.fn();
const deleteSessionMock = vi.fn();

// Fake-Account-Objekt statt echtem Appwrite-SDK - useAuth nimmt nur ein "Account"-artiges
// Objekt entgegen, muss also keine echte Client/Account-Instanz sein (siehe appwriteAuth.ts).
const fakeAccount = {
  get: getMock,
  createEmailPasswordSession: createEmailPasswordSessionMock,
  deleteSession: deleteSessionMock,
} as unknown as import('appwrite').Account;

const { useAuth } = await import('../useAuth');

describe('useAuth', () => {
  beforeEach(() => {
    getMock.mockReset();
    createEmailPasswordSessionMock.mockReset();
    deleteSessionMock.mockReset();
  });

  it('startet im Status "checking" und wechselt zu "loggedIn", wenn bereits eine Session existiert', async () => {
    getMock.mockResolvedValueOnce({ email: 'raoul@example.invalid' });
    const { result } = renderHook(() => useAuth(fakeAccount));
    expect(result.current.status).toBe('checking');
    await waitFor(() => expect(result.current.status).toBe('loggedIn'));
    expect(result.current.email).toBe('raoul@example.invalid');
  });

  it('wechselt zu "loggedOut", wenn keine Session existiert (account.get() wirft eine echte AppwriteException)', async () => {
    getMock.mockRejectedValueOnce({ code: 401, message: 'missing scope' });
    const { result } = renderHook(() => useAuth(fakeAccount));
    await waitFor(() => expect(result.current.status).toBe('loggedOut'));
    expect(result.current.email).toBeNull();
  });

  it('wechselt zu "offlineUnknown" (NICHT "loggedOut") bei einem rohen Netzwerkfehler ohne code - z.B. echter Offline-Betrieb', async () => {
    getMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useAuth(fakeAccount));
    await waitFor(() => expect(result.current.status).toBe('offlineUnknown'));
  });

  it('login() erstellt eine Session und wechselt danach zu "loggedIn"', async () => {
    getMock.mockRejectedValueOnce({ code: 401, message: 'missing scope' }); // initiale Prüfung
    createEmailPasswordSessionMock.mockResolvedValueOnce({});
    getMock.mockResolvedValueOnce({ email: 'raoul@example.invalid' }); // Prüfung nach Login

    const { result } = renderHook(() => useAuth(fakeAccount));
    await waitFor(() => expect(result.current.status).toBe('loggedOut'));

    await act(async () => {
      await result.current.login('raoul@example.invalid', 'geheim123');
    });

    expect(createEmailPasswordSessionMock).toHaveBeenCalledWith({ email: 'raoul@example.invalid', password: 'geheim123' });
    expect(result.current.status).toBe('loggedIn');
    expect(result.current.error).toBeNull();
  });

  it('login() setzt eine Fehlermeldung, wenn die Session-Erstellung fehlschlägt (z.B. falsches Passwort)', async () => {
    getMock.mockRejectedValueOnce({ code: 401, message: 'missing scope' });
    createEmailPasswordSessionMock.mockRejectedValueOnce(new Error('Invalid credentials'));

    const { result } = renderHook(() => useAuth(fakeAccount));
    await waitFor(() => expect(result.current.status).toBe('loggedOut'));

    await act(async () => {
      await result.current.login('raoul@example.invalid', 'falsch');
    });

    expect(result.current.status).toBe('loggedOut');
    expect(result.current.error).toBe('Invalid credentials');
  });

  it('logout() löscht die Session und setzt den Status auf "loggedOut"', async () => {
    getMock.mockResolvedValueOnce({ email: 'raoul@example.invalid' });
    deleteSessionMock.mockResolvedValueOnce({});

    const { result } = renderHook(() => useAuth(fakeAccount));
    await waitFor(() => expect(result.current.status).toBe('loggedIn'));

    await act(async () => {
      await result.current.logout();
    });

    expect(deleteSessionMock).toHaveBeenCalledWith({ sessionId: 'current' });
    expect(result.current.status).toBe('loggedOut');
    expect(result.current.email).toBeNull();
  });
});
