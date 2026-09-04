import { useState } from 'react';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
  error: string | null;
}

/**
 * Login-Bildschirm, gezeigt bevor überhaupt versucht wird, den Store zu laden - so landet
 * niemand ungewollt/unbemerkt im lokalen IndexedDB-Fallback, nur weil eine Appwrite-Anfrage
 * mangels Session mit einem Berechtigungsfehler statt einem echten Verbindungsfehler
 * fehlschlägt (siehe createStore.ts). Bewusst schlicht gehalten - Login passiert normalerweise
 * nur einmal pro Gerät, da Appwrite-Sessions lange halten.
 */
export function LoginView({ onLogin, error }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      await onLogin(email, password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sheet-backdrop" style={{ alignItems: 'center' }}>
      <div className="sheet" style={{ borderRadius: 18, maxHeight: 'none' }}>
        <h2>Anmelden</h2>
        <div className="sheet-sub">Zeiterfassung – Zugriff nur für dich</div>

        {error && (
          <div id="loginError" className="warn-banner">⚠ {error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>E-Mail</label>
            <input
              id="f_loginEmail"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Passwort</label>
            <input
              id="f_loginPassword"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="sheet-actions">
            <button className="save" id="loginBtn" type="submit" disabled={submitting}>
              {submitting ? 'Wird geprüft…' : 'Anmelden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
