import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
  error: string | null;
}

const labelCls = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-muted';
const inputCls =
  'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] text-text ' +
  'placeholder:text-text-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
      <div className="w-full max-w-[400px] rounded-2xl bg-surface-2 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <h2 className="m-0 text-[19px] font-semibold text-text">Anmelden</h2>
        <div className="mb-5 mt-1 text-xs text-text-muted">Zeiterfassung – Zugriff nur für dich</div>

        {error && (
          <div id="loginError" className="mb-3.5 flex items-center gap-1.5 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2.5 text-xs font-semibold text-danger">
            <AlertTriangle size={15} className="flex-shrink-0" strokeWidth={2.25} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-3.5">
            <label className={labelCls}>E-Mail</label>
            <input
              className={inputCls}
              id="f_loginEmail"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mb-3.5">
            <label className={labelCls}>Passwort</label>
            <input
              className={inputCls}
              id="f_loginPassword"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            className="w-full rounded-lg bg-primary px-3 py-3 text-sm font-bold text-text-on-accent shadow-[0_4px_16px_-2px_rgba(99,102,241,0.4)] transition-colors hover:bg-primary-strong disabled:opacity-60"
            id="loginBtn"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Wird geprüft…' : 'Anmelden'}
          </button>
        </form>
      </div>
    </div>
  );
}
