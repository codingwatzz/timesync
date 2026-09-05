import type { StorageMode } from '../store/types';

const MODE_LABEL: Record<StorageMode, string> = {
  'ermittelt-noch': 'wird ermittelt…',
  appwrite: 'Appwrite Cloud-Sync (aktiv)',
  indexeddb: 'Lokal (IndexedDB) – KEIN Geräte-Sync!',
  'claude-artefakt': 'Claude-Artefakt',
};

interface DiagnosePanelProps {
  mode: StorageMode;
  log: string[];
  open: boolean;
  onClose: () => void;
}

/** Zeigt Diagnose-Infos (Speicher-Modus, URL, Log) - seit 04.09.2026 eine reine, von außen
 * gesteuerte Komponente (kein eigener sichtbarer Auslöse-Button mehr), erreichbar über das
 * Zahnrad-Menü (SettingsMenu.tsx) statt eines eigenen schwebenden Buttons. */
export function DiagnosePanel({ mode, log, open, onClose }: DiagnosePanelProps) {
  const content = [
    `Speicher-Modus: ${MODE_LABEL[mode]}`,
    `URL: ${location.href}`,
    `User-Agent: ${navigator.userAgent}`,
    '',
    log.length ? log.join('\n') : '(noch keine Log-Einträge)',
  ].join('\n');

  return (
    <div id="debugOverlay" className={open ? 'show' : ''}>
      <div id="debugPanel">
        <div className="debug-header">Diagnose</div>
        <pre id="debugContent">{content}</pre>
        <button id="debugCloseBtn" onClick={onClose}>Schließen</button>
      </div>
    </div>
  );
}
