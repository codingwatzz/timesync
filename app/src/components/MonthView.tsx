import { useState } from 'react';
import { ChevronLeft, ChevronRight, Cloud, TriangleAlert } from 'lucide-react';
import { MONATSNAMEN } from '../core/constants';
import { daysInMonth, fmtEUR } from '../core/formatters';
import { dateKey, defaultTyp, feiertagName } from '../core/holidays';
import { tagesKosten } from '../core/entry';
import { toNumber } from '../core/formatters';
import { DayRow } from './DayRow';
import { SettingsMenu } from './SettingsMenu';
import { MonthPreviews } from './MonthPreviews';
import { useSwipe } from '../hooks/useSwipe';
import type { TagesEintrag } from '../core/types';
import type { StorageMode } from '../store/types';

const SYNC_BADGE: Record<StorageMode, { label: string; ok: boolean }> = {
  appwrite: { label: 'Sync aktiv', ok: true },
  'claude-artefakt': { label: 'Claude-Speicher', ok: true },
  indexeddb: { label: 'kein Sync', ok: false },
  'ermittelt-noch': { label: 'kein Sync', ok: false },
};

interface MonthViewProps {
  year: number;
  month: number;
  entries: Record<string, TagesEintrag>;
  syncMode: StorageMode;
  log: string[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onOpenDay: (key: string) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
}

export function MonthView({
  year, month, entries, syncMode, log, onPrevMonth, onNextMonth, onOpenDay, onExport, onImportFile,
}: MonthViewProps) {
  const n = daysInMonth(year, month);
  const days = Array.from({ length: n }, (_, i) => i + 1);
  // Solange ein Vorschau-Panel (Spesen/Arbeitszeiten) aufgeklappt ist, wird der Export-Button
  // NICHT mehr schwebend dargestellt - er würde sonst Tabelleninhalte permanent verdecken,
  // egal wie weit gescrollt wird (siehe UX-Audit 05.09.2026, Punkt 13). Stattdessen erscheint
  // er dann als normaler Button direkt im Textfluss unter den Panels.
  const [previewOffen, setPreviewOffen] = useState(false);

  let nonHoCount = 0;
  let kmSum = 0;
  let kostenSum = 0;
  for (const d of days) {
    const e = entries[dateKey(year, month, d)];
    if (!e) continue;
    // Kosten (inkl. "Sonstiges €") an JEDEM Tag mitzählen - seit der Erweiterung vom 02.09.2026
    // kann "Sonstiges €" unabhängig von Tagestyp/Homeoffice eingegeben werden (z.B.
    // Bahncard/Deutschlandticket am 1. eines Monats, auch an einem Wochenendtag). "Vor Ort"-
    // Tage-Zähler und gefahrene km bleiben bewusst nur an echten Arbeitstagen vor Ort gezählt.
    kostenSum += tagesKosten(e);
    if (e.typ === 'A' && !e.ho) {
      nonHoCount++;
      kmSum += toNumber(e.km);
    }
  }

  const badge = SYNC_BADGE[syncMode];
  // Wischen nach links = weiter (nächster Monat), nach rechts = zurück (voriger Monat) -
  // gängige Konvention aus Kalender-/Foto-Apps.
  const swipeHandlers = useSwipe(onNextMonth, onPrevMonth);

  const exportBtnCls =
    'rounded-full bg-primary px-6 py-3.5 text-sm font-bold text-text-on-accent shadow-[0_6px_20px_-4px_rgba(99,102,241,0.5)] ' +
    'transition-colors hover:bg-primary-strong focus-visible:ring-2 focus-visible:ring-text focus-visible:outline-none';

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-surface-2 px-4 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <SettingsMenu mode={syncMode} log={log} onImportFile={onImportFile} />
          <h1 className="m-0 text-[19px] font-bold tracking-tight text-text">Zeiterfassung</h1>
          <span
            className={`flag ${badge.ok ? 'ho' : 'warn'} ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              badge.ok ? 'bg-primary-soft text-primary' : 'bg-warning-soft text-warning'
            }`}
          >
            {badge.ok ? <Cloud size={11} strokeWidth={2.5} /> : <TriangleAlert size={11} strokeWidth={2.5} />}
            {badge.label}
          </span>
        </div>
        <div className="mt-3.5 flex items-center justify-between">
          <button
            id="prevM"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            onClick={onPrevMonth}
          >
            <ChevronLeft size={20} strokeWidth={2.25} />
          </button>
          <div className="label text-center text-[16px] font-bold text-text">
            {MONATSNAMEN[month - 1]} {year}
            <span className="mt-0.5 block text-[12px] font-normal text-text-muted">{n} Tage</span>
          </div>
          <button
            id="nextM"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            onClick={onNextMonth}
          >
            <ChevronRight size={20} strokeWidth={2.25} />
          </button>
        </div>
        <div className="summary-strip mt-3 flex gap-2">
          <div className="pill flex-1 rounded-[10px] border border-border bg-surface px-2.5 py-2">
            <div className="n font-mono text-[15px] font-bold text-text">{nonHoCount}</div>
            <div className="l text-[10px] uppercase tracking-wide text-text-muted">Vor Ort</div>
          </div>
          <div className="pill flex-1 rounded-[10px] border border-border bg-surface px-2.5 py-2">
            <div className="n font-mono text-[15px] font-bold text-text">{kmSum}</div>
            <div className="l text-[10px] uppercase tracking-wide text-text-muted">km</div>
          </div>
          <div className="pill flex-1 rounded-[10px] border border-border bg-surface px-2.5 py-2">
            <div className="n font-mono text-[15px] font-bold text-text">{fmtEUR(kostenSum)}</div>
            <div className="l text-[10px] uppercase tracking-wide text-text-muted">€ Kosten</div>
          </div>
        </div>
      </header>

      <main className="flex-1 px-3.5 pb-24 pt-2.5" {...swipeHandlers}>
        {days.map((d) => {
          const key = dateKey(year, month, d);
          const e = entries[key];
          const typ = e ? e.typ : defaultTyp(year, month, d);
          const feiertag = feiertagName(year, month, d);
          return (
            <DayRow
              key={key}
              year={year} month={month} day={d}
              entry={e} typ={typ} feiertag={feiertag}
              onClick={() => onOpenDay(key)}
            />
          );
        })}
        <MonthPreviews year={year} month={month} entries={entries} onOffenChange={setPreviewOffen} />
        {previewOffen && (
          <button id="exportBtn" className={`mb-6 w-full ${exportBtnCls}`} onClick={onExport}>
            Monat exportieren →
          </button>
        )}
      </main>

      {!previewOffen && (
        <div className="fixed bottom-[22px] left-1/2 flex w-[min(452px,calc(100%-32px))] -translate-x-1/2 justify-center pointer-events-none">
          <button id="exportBtn" className={`pointer-events-auto px-6 ${exportBtnCls}`} onClick={onExport}>
            Monat exportieren →
          </button>
        </div>
      )}
    </>
  );
}
