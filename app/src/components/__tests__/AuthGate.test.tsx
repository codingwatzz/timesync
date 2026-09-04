// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const useAuthMock = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: useAuthMock }));

// StoreProvider real laufen zu lassen würde einen echten Appwrite-Verbindungsversuch
// bedeuten (nicht Sinn dieses Tests - AuthGate soll nur RICHTIG zwischen den drei
// Auth-Zuständen umschalten, nicht die Store-Logik selbst prüfen, die ist bereits in
// createStore.test.ts abgedeckt).
vi.mock('../../hooks/StoreContext', () => ({
  StoreProvider: ({ children }: { children: React.ReactNode }) => <div id="fakeStoreProvider">{children}</div>,
}));

const { AuthGate } = await import('../AuthGate');

const DUMMY_ACCOUNT = {} as unknown as import('appwrite').Account;
const DUMMY_STORE_CONFIG = { endpoint: 'https://example.invalid/v1', projectId: 'p', databaseId: 'd', tableId: 't', bucketId: 'b' };

describe('AuthGate', () => {
  it('zeigt nichts Auffälliges während der Session-Prüfung (status "checking")', () => {
    useAuthMock.mockReturnValue({ status: 'checking', error: null, login: vi.fn() });
    const { container } = render(
      <AuthGate account={DUMMY_ACCOUNT} storeConfig={DUMMY_STORE_CONFIG}><div>App-Inhalt</div></AuthGate>,
    );
    expect(container.querySelector('#authChecking')).toBeInTheDocument();
    expect(screen.queryByText('App-Inhalt')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument();
  });

  it('zeigt den Login-Bildschirm bei status "loggedOut"', () => {
    useAuthMock.mockReturnValue({ status: 'loggedOut', error: null, login: vi.fn() });
    render(<AuthGate account={DUMMY_ACCOUNT} storeConfig={DUMMY_STORE_CONFIG}><div>App-Inhalt</div></AuthGate>);
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.queryByText('App-Inhalt')).not.toBeInTheDocument();
  });

  it('zeigt die Kinder (App) innerhalb des StoreProvider bei status "loggedIn"', () => {
    useAuthMock.mockReturnValue({ status: 'loggedIn', error: null, login: vi.fn() });
    const { container } = render(
      <AuthGate account={DUMMY_ACCOUNT} storeConfig={DUMMY_STORE_CONFIG}><div>App-Inhalt</div></AuthGate>,
    );
    expect(screen.getByText('App-Inhalt')).toBeInTheDocument();
    expect(container.querySelector('#fakeStoreProvider')).toBeInTheDocument();
  });

  it('zeigt die Kinder AUCH bei status "offlineUnknown" (echter Netzwerkfehler, z.B. offline) - kein Login-Zwang ohne Netz', () => {
    useAuthMock.mockReturnValue({ status: 'offlineUnknown', error: null, login: vi.fn() });
    render(<AuthGate account={DUMMY_ACCOUNT} storeConfig={DUMMY_STORE_CONFIG}><div>App-Inhalt</div></AuthGate>);
    expect(screen.getByText('App-Inhalt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anmelden' })).not.toBeInTheDocument();
  });
});
