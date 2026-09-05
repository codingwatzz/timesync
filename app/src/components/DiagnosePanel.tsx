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
    <div
      id="debugOverlay"
      className={`${open ? 'show flex' : 'hidden'} fixed inset-0 z-[200] items-center justify-center bg-black/60`}
    >
      <div id="debugPanel" className="flex max-h-[78vh] w-[min(92vw,480px)] flex-col rounded-2xl bg-surface-2 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        <div className="debug-header mb-2 text-sm font-bold text-primary">Diagnose</div>
        <pre id="debugContent" className="mb-2.5 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface p-2.5 font-mono text-[11px] text-text">
          {content}
        </pre>
        <button
          id="debugCloseBtn"
          className="self-end rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-text-on-accent transition-colors hover:bg-primary-strong"
          onClick={onClose}
        >
          Schließen
        </button>
      </div>
    </div>
  );
}
