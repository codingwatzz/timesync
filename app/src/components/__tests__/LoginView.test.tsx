// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginView } from '../LoginView';

describe('LoginView', () => {
  it('ruft onLogin mit den eingegebenen Werten auf', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<LoginView onLogin={onLogin} error={null} />);

    fireEvent.change(container.querySelector('#f_loginEmail')!, { target: { value: 'raoul@example.invalid' } });
    fireEvent.change(container.querySelector('#f_loginPassword')!, { target: { value: 'geheim123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('raoul@example.invalid', 'geheim123'));
  });

  it('ruft onLogin NICHT auf, wenn Felder leer sind', () => {
    const onLogin = vi.fn();
    render(<LoginView onLogin={onLogin} error={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('zeigt eine Fehlermeldung an, falls vorhanden', () => {
    render(<LoginView onLogin={vi.fn()} error="Invalid credentials" />);
    expect(screen.getByText(/Invalid credentials/)).toBeInTheDocument();
  });

  it('zeigt KEINE Fehlermeldung, wenn error null ist', () => {
    const { container } = render(<LoginView onLogin={vi.fn()} error={null} />);
    expect(container.querySelector('#loginError')).not.toBeInTheDocument();
  });
});
