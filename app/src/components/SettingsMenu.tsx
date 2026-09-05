import { useRef, useState } from 'react';
import { Settings, Upload, Wrench, Sun, Moon } from 'lucide-react';
import { DiagnosePanel } from './DiagnosePanel';
import { useTheme } from '../hooks/useTheme';
import type { StorageMode } from '../store/types';

interface SettingsMenuProps {
  mode: StorageMode;
  log: string[];
  onImportFile: (file: File) => void;
}

/** Zahnrad-Menü oben links - bündelt seltener gebrauchte Funktionen (Import, Diagnose,
 * Light/Dark), die vorher als eigene, ständig sichtbare Buttons in der Monatsansicht standen.
 * "Monat exportieren" bleibt bewusst ein eigener, gut sichtbarer Button (wird monatlich
 * gebraucht, im Gegensatz zu Import/Diagnose/Theme). Zahnrad statt Drei-Linien-Menü, weil diese
 * App nur EINE Hauptansicht hat (den Kalender) - ein Hamburger-Menü würde fälschlich mehrere
 * Top-Level-Seiten suggerieren. */
export function SettingsMenu({ mode, log, onImportFile }: SettingsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [diagnoseOpen, setDiagnoseOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="settings-menu relative flex">
      <button
        id="settingsBtn"
        title="Einstellungen"
        className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text"
        onClick={() => setMenuOpen((o) => !o)}
      >
        <Settings size={19} strokeWidth={2} />
      </button>

      {menuOpen && (
        <>
          <div className="settings-backdrop fixed inset-0 z-[95]" onClick={() => setMenuOpen(false)} />
          <div className="settings-dropdown absolute left-0 top-[calc(100%+4px)] z-[96] flex min-w-[180px] flex-col overflow-hidden rounded-lg border border-border bg-surface-2 shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
            <button
              id="themeToggleBtn"
              className="flex items-center gap-2 px-3.5 py-2.5 text-left text-sm text-text transition-colors hover:bg-surface"
              onClick={() => { toggleTheme(); setMenuOpen(false); }}
            >
              {theme === 'dark' ? <Sun size={15} strokeWidth={2.25} /> : <Moon size={15} strokeWidth={2.25} />}
              {theme === 'dark' ? 'Heller Modus' : 'Dunkler Modus'}
            </button>
            <button
              className="flex items-center gap-2 border-t border-border px-3.5 py-2.5 text-left text-sm text-text transition-colors hover:bg-surface"
              onClick={() => { setMenuOpen(false); importInputRef.current?.click(); }}
            >
              <Upload size={15} strokeWidth={2.25} /> Importieren
            </button>
            <button
              className="flex items-center gap-2 border-t border-border px-3.5 py-2.5 text-left text-sm text-text transition-colors hover:bg-surface"
              onClick={() => { setMenuOpen(false); setDiagnoseOpen(true); }}
            >
              <Wrench size={15} strokeWidth={2.25} /> Diagnose
            </button>
          </div>
        </>
      )}

      <input
        ref={importInputRef}
        id="importFileInput"
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(ev) => {
          const file = ev.target.files?.[0];
          if (file) onImportFile(file);
          ev.target.value = '';
        }}
      />

      <DiagnosePanel mode={mode} log={log} open={diagnoseOpen} onClose={() => setDiagnoseOpen(false)} />
    </div>
  );
}
