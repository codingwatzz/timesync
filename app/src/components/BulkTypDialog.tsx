import { useState } from 'react';
import { CalendarRange, ShieldAlert } from 'lucide-react';
import { TYP_LABEL } from '../core/constants';
import type { Wochentyp, TagesEintrag } from '../core/types';
import type { KVStore } from '../store/types';
import { buildBulkTypPlan, applyBulkTypPlan } from '../lib/bulkTyp';
import type { BulkTypPlan } from '../lib/bulkTyp';

// Manuell wählbare Tagestypen - 'W'/'F' (Wochenende/Feiertag) werden automatisch anhand des
// Kalenders vergeben, kein Nutzer-Eingabefall.
const WAEHLBARE_TYPEN: Wochentyp[] = ['U', 'K', 'G', 'A'];

interface BulkTypDialogProps {
  open: boolean;
  onClose: () => void;
  store: KVStore | null;
  saveEntry: (key: string, data: TagesEintrag) => Promise<void>;
  reload: () => Promise<void>;
  showToast: (msg: string) => void;
}

/** Zeitraum auf einen Tagestyp setzen (z.B. "2 Wochen Urlaub"), ohne jeden Tag einzeln
 * anklicken zu müssen - Nutzerwunsch 07.09.2026. Zweistufig wie der Import-Dialog: erst
 * Formular (Typ + Von/Bis), dann eine Übersicht mit Bestätigung, BEVOR irgendetwas
 * geschrieben wird. Wochenenden/Feiertage werden automatisch übersprungen, ohne eigenen
 * Schalter dafür - ergibt bei "Urlaub eintragen" ohnehin keinen Sinn. */
export function BulkTypDialog({ open, onClose, store, saveEntry, reload, showToast }: BulkTypDialogProps) {
  const [typ, setTyp] = useState<Wochentyp>('U');
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');
  const [plan, setPlan] = useState<BulkTypPlan | null>(null);
  const [keepData, setKeepData] = useState(true);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function resetAndClose() {
    setTyp('U'); setVon(''); setBis(''); setPlan(null); setKeepData(true);
    onClose();
  }

  async function handleWeiter() {
    if (!store || !von || !bis) return;
    if (von > bis) { showToast('"Von" muss vor oder gleich "Bis" liegen'); return; }
    setBusy(true);
    try {
      const p = await buildBulkTypPlan(store, von, bis, typ);
      if (p.days.length === 0) {
        showToast('Im gewählten Zeitraum liegt kein einziger Werktag (nur Wochenenden/Feiertage)');
      } else {
        setPlan(p);
      }
    } catch (e) {
      showToast(`Prüfung fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleBestaetigen() {
    if (!plan || !store) return;
    setBusy(true);
    const { succeeded, failedKeys } = await applyBulkTypPlan(store, plan, saveEntry, keepData);
    await reload();
    setBusy(false);
    resetAndClose();
    showToast(
      failedKeys.length === 0
        ? `${succeeded} Tag${succeeded !== 1 ? 'e' : ''} auf "${TYP_LABEL[plan.typ]}" gesetzt`
        : `${succeeded} gesetzt, ${failedKeys.length} fehlgeschlagen: ${failedKeys.slice(0, 3).join(', ')}${failedKeys.length > 3 ? '…' : ''}`,
    );
  }

  const tageMitDaten = plan ? plan.days.filter((d) => d.hasData).length : 0;

  return (
    <div
      id="bulkTypDialog"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-5"
      onClick={(e) => { if (e.target === e.currentTarget) resetAndClose(); }}
    >
      <div className="w-full max-w-[400px] rounded-2xl bg-surface-2 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <div className="mb-3 flex items-center gap-2 text-primary">
          <CalendarRange size={20} strokeWidth={2.25} />
          <span className="text-[15px] font-bold text-text">Zeitraum auf Tagestyp setzen</span>
        </div>

        {!plan ? (
          <>
            <p className="mb-3 text-xs leading-relaxed text-text-muted">
              Wochenenden und Feiertage im Zeitraum werden automatisch übersprungen.
            </p>
            <div className="mb-3">
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Tagestyp</label>
              <select
                id="bulkTypSelect"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                value={typ}
                onChange={(e) => setTyp(e.target.value as Wochentyp)}
              >
                {WAEHLBARE_TYPEN.map((t) => <option key={t} value={t}>{TYP_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="mb-4 flex gap-2.5">
              <div className="flex-1">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Von</label>
                <input
                  id="bulkTypVon" type="date" value={von} onChange={(e) => setVon(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">Bis</label>
                <input
                  id="bulkTypBis" type="date" value={bis} onChange={(e) => setBis(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex gap-2.5">
              <button
                id="bulkTypCancelBtn"
                className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-bold text-text transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                onClick={resetAndClose}
              >
                Abbrechen
              </button>
              <button
                id="bulkTypWeiterBtn"
                disabled={!von || !bis || busy}
                className="min-h-11 flex-1 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-text-on-accent transition-colors hover:bg-primary-strong focus-visible:ring-2 focus-visible:ring-text focus-visible:outline-none disabled:opacity-50"
                onClick={handleWeiter}
              >
                {busy ? 'Prüfe…' : 'Weiter'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-2 text-sm leading-relaxed text-text">
              <strong>{plan.days.length}</strong> Werktag{plan.days.length !== 1 ? 'e' : ''} im
              Zeitraum {plan.von} bis {plan.bis} werden auf „{TYP_LABEL[plan.typ]}" gesetzt
              {plan.skipped > 0 && <> ({plan.skipped} Wochenend-/Feiertag{plan.skipped !== 1 ? 'e' : ''} übersprungen)</>}.
            </p>

            {tageMitDaten > 0 ? (
              <>
                <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs font-semibold text-warning">
                  <ShieldAlert size={15} className="flex-shrink-0" strokeWidth={2.25} />
                  {tageMitDaten} von {plan.days.length} Tagen haben bereits erfasste
                  Zeiten/Kosten/Belege.
                </div>
                <div className="mb-4 space-y-2">
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm has-[:checked]:border-primary">
                    <input type="radio" name="keepData" className="mt-1" checked={keepData} onChange={() => setKeepData(true)} />
                    <span><strong className="text-text">Daten behalten</strong><br /><span className="text-xs text-text-muted">Nur der Tagestyp ändert sich, wie bei einem einzelnen Tag.</span></span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm has-[:checked]:border-primary">
                    <input type="radio" name="keepData" className="mt-1" checked={!keepData} onChange={() => setKeepData(false)} />
                    <span><strong className="text-text">Daten löschen</strong><br /><span className="text-xs text-text-muted">Zeiten/Kosten/Beleg-Zuordnung werden für diese Tage entfernt (Beschreibung/Sonstiges bleiben erhalten).</span></span>
                  </label>
                </div>
              </>
            ) : (
              <div className="mb-4 text-xs font-semibold text-success">
                Keiner dieser Tage hat bisher Daten - nichts geht dabei verloren.
              </div>
            )}

            <div className="flex gap-2.5">
              <button
                id="bulkTypBackBtn"
                className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-bold text-text transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                onClick={() => setPlan(null)}
              >
                Zurück
              </button>
              <button
                id="bulkTypConfirmBtn"
                disabled={busy}
                className="min-h-11 flex-1 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-text-on-accent transition-colors hover:bg-primary-strong focus-visible:ring-2 focus-visible:ring-text focus-visible:outline-none disabled:opacity-50"
                onClick={handleBestaetigen}
              >
                {busy ? 'Setze…' : 'Jetzt setzen'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
