import { WOCHENTAGE, TYP_LABEL } from '../core/constants';
import { pad, toNumber, istVergangenheit } from '../core/formatters';
import { tagesKosten, istVorOrtTag, fehltArbeitszeit } from '../core/entry';
import { fmtEUR } from '../core/formatters';
import { Home, Plane, AlertTriangle, Receipt } from 'lucide-react';
import type { TagesEintrag, Wochentyp } from '../core/types';

const TAB_BG: Record<Wochentyp, string> = {
  A: 'bg-tab-a', W: 'bg-tab-w', F: 'bg-tab-f', U: 'bg-tab-u', K: 'bg-tab-k', G: 'bg-tab-g',
};

const flagBase = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold';

interface DayRowProps {
  year: number;
  month: number;
  day: number;
  entry: TagesEintrag | undefined;
  typ: TagesEintrag['typ'];
  feiertag: string | null;
  onClick: () => void;
}

export function DayRow({ year, month, day, entry, typ, feiertag, onClick }: DayRowProps) {
  const dow = WOCHENTAGE[new Date(year, month - 1, day).getDay()];
  const isWeekend = typ === 'W';
  const heute = new Date();
  const isToday = year === heute.getFullYear() && month === heute.getMonth() + 1 && day === heute.getDate();

  const flags: React.ReactNode[] = [];
  if (entry?.ho) {
    flags.push(
      <span key="ho" className={`flag ho ${flagBase} bg-primary-soft text-primary`}>
        <Home size={11} strokeWidth={2.5} /> Homeoffice
      </span>,
    );
  }
  const vorOrt = istVorOrtTag(entry);
  if (vorOrt) {
    flags.push(
      <span key="trip" className={`flag trip ${flagBase} bg-secondary-soft text-secondary`}>
        <Plane size={11} strokeWidth={2.5} /> extern
      </span>,
    );
  }
  if (vorOrt && !entry?.reiseart) {
    flags.push(
      <span key="warn" className={`flag warn ${flagBase} bg-warning-soft text-warning`}>
        <AlertTriangle size={11} strokeWidth={2.5} /> Reiseart fehlt
      </span>,
    );
  }
  // Vergangener Arbeitstag ohne erfasste Arbeitszeit (weder Eintrag noch Start/Ende) - damit
  // er nicht vergessen wird. Der heutige Tag zählt bewusst noch nicht als "vergessen", er
  // kann noch nachgetragen werden.
  if (istVergangenheit(year, month, day) && fehltArbeitszeit(entry, typ)) {
    flags.push(
      <span key="notime" className={`flag warn ${flagBase} bg-warning-soft text-warning`}>
        <AlertTriangle size={11} strokeWidth={2.5} /> Keine Arbeitszeit erfasst
      </span>,
    );
  }
  const km = toNumber(entry?.km);
  if (km > 0) {
    flags.push(
      <span key="km" className={`flag km ${flagBase} bg-secondary-soft text-secondary`}>{km} km</span>,
    );
  }
  if (entry?.receiptIds?.length) {
    flags.push(
      <span key="receipt" className={`flag receipt ${flagBase} bg-surface border border-border text-text-muted`}>
        <Receipt size={11} strokeWidth={2.5} />
        {entry.receiptIds.length} Beleg{entry.receiptIds.length > 1 ? 'e' : ''}
      </span>,
    );
  }

  const desc = entry?.beschreibung || feiertag || '';
  const sum = entry ? tagesKosten(entry) : 0;

  return (
    <div
      className={`day-row${isWeekend ? ' weekend' : ''}${isToday ? ' today' : ''}
        flex items-stretch overflow-hidden rounded-xl border bg-surface mb-2 cursor-pointer transition-colors
        ${isWeekend ? 'bg-canvas/60 border-border' : 'border-border hover:border-primary/50'}
        ${isToday ? 'ring-1 ring-primary border-primary' : ''}`}
      onClick={onClick}
    >
      <div className={`tab ${typ} w-1.5 flex-shrink-0 ${TAB_BG[typ]}`} />
      <div className={`day-body flex flex-1 items-center gap-2.5 ${isWeekend ? 'py-1 px-3' : 'py-2.5 px-3'}`}>
        <div className={`day-date flex-shrink-0 ${isWeekend ? 'flex items-baseline gap-1.5' : 'w-11'}`}>
          <div className={`dow text-text-faint uppercase ${isWeekend ? 'text-[9px]' : 'text-[10px]'}`}>{dow}</div>
          <div
            className={`num font-mono font-bold text-text ${isWeekend ? 'text-[13px]' : 'text-[17px]'}
              ${isToday ? 'today inline-flex items-center justify-center rounded-full bg-primary text-text-on-accent' : ''}`}
            style={isToday ? { minWidth: isWeekend ? 20 : 24, height: isWeekend ? 20 : 24 } : undefined}
          >
            {pad(day)}
          </div>
        </div>
        <div className="day-mid min-w-0 flex-1">
          <div className={`desc truncate text-[13px] ${desc ? 'text-text' : 'italic text-text-faint'} ${isWeekend ? 'text-[11px]' : ''}`}>
            {desc || TYP_LABEL[typ]}
          </div>
          {flags.length > 0 && <div className="day-flags mt-0.5 flex flex-wrap gap-1">{flags}</div>}
        </div>
        <div className="day-right flex-shrink-0 text-right text-[12px] text-text-muted">
          {sum > 0 && <div className="sum font-mono text-[13px] font-bold text-text">{fmtEUR(sum)}&nbsp;€</div>}
        </div>
      </div>
    </div>
  );
}
