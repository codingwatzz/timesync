import { useState } from 'react';
import type { StorageMode } from '../store/types';

const MODE_LABEL: Record<StorageMode, string> = {
  'ermittelt-noch': 'wird ermittelt…',
  appwrite: 'Appwrite Cloud-Sync (aktiv)',
  indexeddb: 'Lokal (IndexedDB) – KEIN Geräte-Sync!',
  'claude-artefakt': 'Claude-Artefakt',
};

export function DiagnosePanel({ mode, log }: { mode: StorageMode; log: string[] }) {
  const [open, setOpen] = useState(false);

  const content = [
    `Speicher-Modus: ${MODE_LABEL[mode]}`,
    `URL: ${location.href}`,
    `User-Agent: ${navigator.userAgent}`,
    '',
    log.length ? log.join('\n') : '(noch keine Log-Einträge)',
  ].join('\n');

  return (
    <>
      <button id="debugBtn" title="Diagnose anzeigen" onClick={() => setOpen(true)}>
        ℹ️
      </button>
      <div id="debugOverlay" className={open ? 'show' : ''}>
        <div id="debugPanel">
          <div className="debug-header">Diagnose</div>
          <pre id="debugContent">{content}</pre>
          <button id="debugCloseBtn" onClick={() => setOpen(false)}>Schließen</button>
        </div>
      </div>
    </>
  );
}
