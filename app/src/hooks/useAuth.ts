import { useCallback, useEffect, useRef, useState } from 'react';
import type { Account } from 'appwrite';

export type AuthStatus = 'checking' | 'loggedOut' | 'loggedIn' | 'offlineUnknown';

export interface AuthState {
  status: AuthStatus;
  email: string | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Verwaltet den Appwrite-Login-Status. Prüft beim Start, ob bereits eine gültige Session
 * existiert (z.B. von einem früheren Besuch - Appwrite-Sessions halten sich standardmäßig
 * lange, kein täglicher Login nötig) - erst wenn keine existiert, wird 'loggedOut' gesetzt und
 * der Login-Bildschirm gezeigt.
 */
export function useAuth(account: Account): AuthState {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const checkSession = useCallback(async () => {
    try {
      const user = await account.get();
      setEmail(user.email);
      setStatus('loggedIn');
    } catch (e) {
      // Appwrite antwortet auf eine echte Anfrage (auch bei fehlender Session) mit einer
      // strukturierten AppwriteException (hat ein `code`, z.B. 401). Ein reiner
      // Netzwerkfehler (kein Internet, z.B. echter Offline-Betrieb) wirft dagegen einen
      // rohen fetch-Fehler OHNE `code` - den dürfen wir NICHT als "nicht eingeloggt"
      // werten, sonst würde eine bereits eingeloggte Person offline plötzlich den
      // Login-Bildschirm sehen, obwohl die App vorher (vor diesem Feature) offline über
      // den IndexedDB-Fallback (siehe createStore.ts) trotzdem nutzbar war. Bei einem
      // echten Netzwerkfehler lassen wir die App deshalb durch - der Store fällt dort
      // ohnehin selbst auf den lokalen Fallback zurück, falls Appwrite nicht erreichbar ist.
      const isRealAuthError = typeof e === 'object' && e !== null && 'code' in e;
      setStatus(isRealAuthError ? 'loggedOut' : 'offlineUnknown');
    }
  }, [account]);

  useEffect(() => {
    if (initialized.current) return; // React StrictMode ruft Effekte doppelt auf
    initialized.current = true;
    checkSession();
  }, [checkSession]);

  const login = useCallback(async (loginEmail: string, password: string) => {
    setError(null);
    try {
      await account.createEmailPasswordSession({ email: loginEmail, password });
      await checkSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login fehlgeschlagen');
    }
  }, [account, checkSession]);

  const logout = useCallback(async () => {
    try {
      await account.deleteSession({ sessionId: 'current' });
    } catch {
      /* Session war evtl. schon abgelaufen - egal, wir setzen den Status trotzdem zurück */
    }
    setEmail(null);
    setStatus('loggedOut');
  }, [account]);

  return { status, email, error, login, logout };
}
