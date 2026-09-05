// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsMenu } from '../SettingsMenu';

describe('SettingsMenu', () => {
  it('zeigt das Dropdown erst NACH einem Klick auf das Zahnrad', () => {
    render(<SettingsMenu mode="appwrite" log={[]} onImportFile={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Importieren' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Einstellungen'));
    expect(screen.getByRole('button', { name: 'Importieren' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diagnose' })).toBeInTheDocument();
  });

  it('öffnet die Diagnose-Übersicht beim Klick auf "Diagnose" und schließt das Dropdown', () => {
    const { container } = render(<SettingsMenu mode="appwrite" log={['Testeintrag']} onImportFile={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Einstellungen'));
    fireEvent.click(screen.getByRole('button', { name: 'Diagnose' }));
    expect(container.querySelector('#debugOverlay.show')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Importieren' })).not.toBeInTheDocument();
    expect(screen.getByText(/Testeintrag/)).toBeInTheDocument();
  });

  it('löst den versteckten Datei-Dialog aus und ruft onImportFile beim Auswählen einer Datei auf', () => {
    const onImportFile = vi.fn();
    const { container } = render(<SettingsMenu mode="appwrite" log={[]} onImportFile={onImportFile} />);
    fireEvent.click(screen.getByTitle('Einstellungen'));
    const fileInput = container.querySelector<HTMLInputElement>('#importFileInput')!;
    const file = new File(['{}'], 'backup.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onImportFile).toHaveBeenCalledWith(file);
  });

  it('schließt das Dropdown bei Klick auf den Hintergrund', () => {
    const { container } = render(<SettingsMenu mode="appwrite" log={[]} onImportFile={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Einstellungen'));
    expect(screen.getByText('Importieren')).toBeInTheDocument();
    fireEvent.click(container.querySelector('.settings-backdrop')!);
    expect(screen.queryByText('Importieren')).not.toBeInTheDocument();
  });
});
