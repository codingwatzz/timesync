import { useState } from 'react';
import { ShieldAlert, Download, Info } from 'lucide-react';
import { downloadPreImportBackup } from '../lib/importPlan';
import type { ImportPlan } from '../lib/importPlan';

interface ImportConfirmDialogProps {
  plan: ImportPlan | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Zwischenschritt VOR jedem Import (siehe UX-Review 06.09.2026, Punkt 4.1) - vorher schrieb
 * ein Import sofort und ohne jede Rückfrage in den Store, obwohl er bestehende Tage
 * überschreiben kann. Zeigt: (1) einen Hinweis, welches Dateiformat erwartet wird, (2) wie
 * viele Tage importiert werden und wie viele davon bestehende Daten überschreiben würden,
 * (3) einen optionalen Button für eine Sicherheitskopie NUR der überschriebenen Tage, bevor
 * der Nutzer den eigentlichen Import bestätigt.
 */
export function ImportConfirmDialog({ plan, onCancel, onConfirm }: ImportConfirmDialogProps) {
  const [backupDone, setBackupDone] = useState(false);

  if (!plan) return null;

  const hatUeberschreibungen = plan.overwriteKeys.length > 0;

  function handleBackup() {
    downloadPreImportBackup(plan!);
    setBackupDone(true);
  }

  return (
    <div
      id="importConfirmDialog"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-[400px] rounded-2xl bg-surface-2 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <div className={`mb-3 flex items-center gap-2 ${hatUeberschreibungen ? 'text-warning' : 'text-primary'}`}>
          <ShieldAlert size={20} strokeWidth={2.25} />
          <span className="text-[15px] font-bold text-text">Import bestätigen</span>
        </div>

        <div className="mb-3.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs leading-relaxed text-text-muted">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-text">
            <Info size={13} strokeWidth={2.5} /> Erwartetes Format
          </div>
          Nur unveränderte Export-/Backup-Dateien dieser App - z. B. das
          „..._Rohdaten-Backup.json" aus dem Monats-Export, oder eine ältere
          Einträge-Datei mit einem „entries"-Array. Andere JSON-Dateien werden abgelehnt.
        </div>

        <p className="mb-2 text-sm leading-relaxed text-text">
          Diese Datei enthält <strong>{plan.candidates.length}</strong> Tageseintrag
          {plan.candidates.length !== 1 ? 'e' : ''}
          {plan.fromKey && plan.toKey && (
            <> (Zeitraum {plan.fromKey} bis {plan.toKey})</>
          )}.
        </p>

        {hatUeberschreibungen ? (
          <div className="mb-3.5 flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs font-semibold text-warning">
            <ShieldAlert size={15} className="flex-shrink-0" strokeWidth={2.25} />
            {plan.overwriteKeys.length} von {plan.candidates.length} Tagen haben bereits
            Daten, die dabei überschrieben werden.
          </div>
        ) : (
          <div className="mb-3.5 text-xs font-semibold text-success">
            Keiner dieser Tage hat bisher Daten - nichts geht dabei verloren.
          </div>
        )}

        {hatUeberschreibungen && (
          <button
            id="importBackupBtn"
            className="mb-3.5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-transparent px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            onClick={handleBackup}
          >
            <Download size={15} strokeWidth={2.25} />
            {backupDone ? 'Sicherheitskopie erneut herunterladen' : `Sicherheitskopie herunterladen (${plan.overwriteKeys.length} Tage)`}
          </button>
        )}

        <div className="flex gap-2.5">
          <button
            id="importCancelBtn"
            className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-bold text-text transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            onClick={onCancel}
          >
            Abbrechen
          </button>
          <button
            id="importConfirmBtn"
            className={`min-h-11 flex-1 rounded-lg px-3 py-2.5 text-sm font-bold text-text-on-accent transition-colors focus-visible:ring-2 focus-visible:ring-text focus-visible:outline-none ${
              hatUeberschreibungen ? 'bg-warning text-canvas hover:opacity-90' : 'bg-primary hover:bg-primary-strong'
            }`}
            onClick={onConfirm}
          >
            Jetzt importieren
          </button>
        </div>
      </div>
    </div>
  );
}
