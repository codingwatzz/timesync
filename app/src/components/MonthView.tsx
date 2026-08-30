import { useRef } from 'react';
import { MONATSNAMEN } from '../core/constants';
import { daysInMonth, fmtEUR } from '../core/formatters';
import { dateKey, defaultTyp, feiertagName } from '../core/holidays';
import { tagesKosten } from '../core/entry';
import { toNumber } from '../core/formatters';
import { DayRow } from './DayRow';
import type { TagesEintrag } from '../core/types';
import type { StorageMode } from '../store/types';

const SYNC_BADGE: Record<StorageMode, { label: string; className: string }> = {
  appwrite: { label: '☁ Sync aktiv', className: 'flag ho' },
  'claude-artefakt': { label: 'Claude-Speicher', className: 'flag ho' },
  indexeddb: { label: '⚠ kein Sync', className: 'flag warn' },
  'ermittelt-noch': { label: '⚠ kein Sync', className: 'flag warn' },
};

interface MonthViewProps {
  year: number;
  month: number;
  entries: Record<string, TagesEintrag>;
  syncMode: StorageMode;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onOpenDay: (key: string) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
}

export function MonthView({
  year, month, entries, syncMode, onPrevMonth, onNextMonth, onOpenDay, onExport, onImportFile,
}: MonthViewProps) {
  const n = daysInMonth(year, month);
  const days = Array.from({ length: n }, (_, i) => i + 1);

  let nonHoCount = 0;
  let kmSum = 0;
  let kostenSum = 0;
  for (const d of days) {
    const e = entries[dateKey(year, month, d)];
    if (e && e.typ === 'A' && !e.ho) {
      nonHoCount++;
      kmSum += toNumber(e.km);
      kostenSum += tagesKosten(e);
    }
  }

  const badge = SYNC_BADGE[syncMode];
  const importInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <header className="top">
        <div className="brand">
          <h1>Zeiterfassung</h1>
          <span className="tag">Ledger</span>
          <span className={badge.className} style={{ marginLeft: 6 }}>{badge.label}</span>
        </div>
        <div className="month-nav">
          <button id="prevM" onClick={onPrevMonth}>‹</button>
          <div className="label">
            {MONATSNAMEN[month - 1]} {year}
            <span className="sub">{n} Tage</span>
          </div>
          <button id="nextM" onClick={onNextMonth}>›</button>
        </div>
        <div className="summary-strip">
          <div className="pill"><div className="n mono">{nonHoCount}</div><div className="l">Vor Ort</div></div>
          <div className="pill"><div className="n mono">{kmSum}</div><div className="l">km</div></div>
          <div className="pill"><div className="n mono">{fmtEUR(kostenSum)}</div><div className="l">€ Kosten</div></div>
        </div>
      </header>

      <main>
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
      </main>

      <div className="fab">
        <button className="secondary" onClick={() => importInputRef.current?.click()}>
          ⇪ Importieren
        </button>
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
        <button id="exportBtn" onClick={onExport}>Monat exportieren →</button>
      </div>
    </>
  );
}
