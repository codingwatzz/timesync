import type { Account } from 'appwrite';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { LoginView } from './LoginView';
import { StoreProvider } from '../hooks/StoreContext';
import type { AppwriteConfig } from '../store/appwriteStore';

interface AuthGateProps {
  account: Account;
  storeConfig: AppwriteConfig;
  children: ReactNode;
}

/**
 * Zeigt den Login-Bildschirm, BEVOR überhaupt versucht wird, den Store zu laden. Wichtig:
 * ohne dieses Gate würde eine fehlende Session in createAppwriteStore() als gewöhnlicher
 * Verbindungsfehler durchgehen und die App stillschweigend auf den lokalen IndexedDB-Fallback
 * umschalten (kein Crash, aber auch kein Sync - nur das dezente "⚠ kein Sync"-Badge würde
 * darauf hindeuten). Mit dem Gate ist "nicht eingeloggt" ein expliziter, sichtbarer Zustand.
 */
export function AuthGate({ account, storeConfig, children }: AuthGateProps) {
  const { status, error, login } = useAuth(account);

  if (status === 'checking') {
    // Kurzer Zwischenzustand beim allerersten Laden (Session-Prüfung läuft noch) - bewusst
    // ganz schlicht, um kein kurzes Aufblitzen des Login-Formulars zu zeigen, falls doch schon
    // eine gültige Session existiert. Zeigt aber (seit UX-Review 06.09.2026, Punkt 4.4)
    // wenigstens einen Spinner statt eines komplett leeren Divs - vorher der einzige Moment
    // in der App ganz ohne Systemstatus-Feedback.
    return (
      <div id="authChecking" className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="animate-spin text-primary" size={28} strokeWidth={2.25} aria-label="Wird geladen…" />
      </div>
    );
  }

  if (status === 'loggedOut') {
    return <LoginView onLogin={login} error={error} />;
  }

  // 'loggedIn' ODER 'offlineUnknown' (echter Netzwerkfehler bei der Session-Prüfung, z.B.
  // Offline-Betrieb) - in beiden Fällen darf die App weiterlaufen. Bei echtem Offline-Betrieb
  // fällt createStore() selbst auf den lokalen IndexedDB-Fallback zurück (unverändertes
  // Verhalten von vor diesem Feature) - das Login-Gate soll das NICHT verhindern.
  return <StoreProvider config={storeConfig}>{children}</StoreProvider>;
}
