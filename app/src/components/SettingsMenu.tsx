import { useRef, useState } from 'react';
import { DiagnosePanel } from './DiagnosePanel';
import type { StorageMode } from '../store/types';

interface SettingsMenuProps {
  mode: StorageMode;
  log: string[];
  onImportFile: (file: File) => void;
}

/** Zahnrad-Menü oben links - bündelt seltener gebrauchte Funktionen (Import, Diagnose), die
 * vorher als eigene, ständig sichtbare Buttons in der Monatsansicht standen. "Monat
 * exportieren" bleibt bewusst ein eigener, gut sichtbarer Button (wird monatlich gebraucht,
 * im Gegensatz zu Import/Diagnose). Zahnrad statt Drei-Linien-Menü, weil diese App nur EINE
 * Hauptansicht hat (den Kalender) - ein Hamburger-Menü würde fälschlich mehrere
 * Top-Level-Seiten suggerieren. */
export function SettingsMenu({ mode, log, onImportFile }: SettingsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [diagnoseOpen, setDiagnoseOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="settings-menu">
      <button id="settingsBtn" title="Einstellungen" onClick={() => setMenuOpen((o) => !o)}>⚙</button>

      {menuOpen && (
        <>
          <div className="settings-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="settings-dropdown">
            <button onClick={() => { setMenuOpen(false); importInputRef.current?.click(); }}>
              ⇪ Importieren
            </button>
            <button onClick={() => { setMenuOpen(false); setDiagnoseOpen(true); }}>
              ℹ️ Diagnose
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
