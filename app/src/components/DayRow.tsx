import { WOCHENTAGE, TYP_LABEL } from '../core/constants';
import { pad, toNumber, istVergangenheit, fmtHHMM } from '../core/formatters';
import { tagesKosten, istVorOrtTag, fehltArbeitszeit, arbeitszeitMinuten } from '../core/entry';
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
  // Kompaktere Darstellung für ALLE Nicht-Arbeitstage (Wochenende, Feiertag, Urlaub, Krank,
  // Gleitfrei) - Nutzerwunsch 07.09.2026, ursprünglich nur für Wochenenden gebaut, auf
  // ausdrücklichen Wunsch auf alle Typen erweitert, an denen planmäßig nicht gearbeitet
  // wird. `isWeekend` bleibt als EIGENE, engere Variable bestehen (nur für die
  // `.weekend`-CSS-Klasse - vom Feiertags-/Urlaubsfall bewusst unterschieden, falls später
  // mal weekend-spezifisches Styling gebraucht wird).
  const isKompakt = typ !== 'A';
  const heute = new Date();
  const isToday = year === heute.getFullYear() && month === heute.getMonth() + 1 && day === heute.getDate();

  const flags: React.ReactNode[] = [];
  // "ho" bewusst nur an ECHTEN Arbeitstagen als Flag zeigen - core/entry.ts::emptyEntry()
  // setzt ho:true als Standard für JEDEN Tag (kein echtes Nutzer-Signal), auch für Urlaub/
  // Krank/Gleitfrei. Ohne diese Prüfung zeigte z.B. ein per "Zeitraum auf Tagestyp setzen"
  // (07.09.2026) auf Urlaub gesetzter Tag fälschlich ein "Homeoffice"-Flag, weil `ho` beim
  // Tagestyp-Wechsel (Einzeltag genauso wie Zeitraum) bewusst NICHT verändert wird - der
  // eigentliche Fehler lag also in dieser Anzeige-Bedingung hier, nicht im Tagestyp-Wechsel
  // selbst (real gemeldet nach einem Test mit "Zeitraum auf Tagestyp setzen").
  if (entry?.ho && typ === 'A') {
    flags.push(
      <span key="ho" className={`flag ho ${flagBase} bg-primary-soft text-primary`}>
        <Home size={11} strokeWidth={2.5} /> Homeoffice
      </span>,
    );
  }
  const vorOrt = istVorOrtTag(entry);
  if (vorOrt) {
    flags.push(
      <span key="trip" className={`flag trip ${flagBase} bg-info-soft text-info`}>
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
  // "km" ist ein reiner MESSWERT (kein Status wie "extern"/"Homeoffice") - bewusst neutral
  // gehalten statt einer weiteren Akzentfarbe, damit Statusfarben eindeutig Status bedeuten
  // (siehe UX-Audit 05.09.2026, Punkt 12).
  const km = toNumber(entry?.km);
  if (km > 0) {
    flags.push(
      <span key="km" className={`flag km ${flagBase} border border-border text-text`}>{km} km</span>,
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
  // Geleistete Arbeitszeit direkt in der Monatsübersicht sichtbar (Nutzerwunsch 07.09.2026,
  // UI/UX-Abstimmung) - HH:MM statt Dezimalstunden, damit es zum Format der Arbeitszeiten-
  // Übersicht/des Exports passt. Wie beim Kostenbetrag: nur anzeigen, wenn wirklich > 0
  // Minuten erfasst sind, sonst Rauschen an Urlaubs-/Kranktagen/Wochenenden.
  const minuten = entry ? arbeitszeitMinuten(entry) : 0;

  return (
    <div
      className={`day-row${isWeekend ? ' weekend' : ''}${isToday ? ' today' : ''}
        flex items-stretch overflow-hidden rounded-xl border bg-surface mb-1.5 cursor-pointer transition-colors
        ${isKompakt ? 'bg-canvas/60 border-border' : 'border-border hover:border-primary/50'}
        ${isToday ? 'ring-1 ring-primary border-primary' : ''}`}
      onClick={onClick}
    >
      <div className={`tab ${typ} w-1.5 flex-shrink-0 ${TAB_BG[typ]}`} />
      <div className={`day-body flex flex-1 items-center gap-2.5 ${isKompakt ? 'py-1 px-3' : 'py-2 px-3'}`}>
        <div className={`day-date flex-shrink-0 leading-tight ${isKompakt ? 'flex items-baseline gap-1.5' : 'w-11'}`}>
          <div className={`dow text-text-faint uppercase ${isKompakt ? 'text-[9px]' : 'text-[10px]'}`}>{dow}</div>
          <div
            className={`num font-mono font-bold text-text ${isKompakt ? 'text-[13px]' : 'text-[17px]'}
              ${isToday ? 'today inline-flex items-center justify-center rounded-full bg-primary text-text-on-accent' : ''}`}
            style={isToday ? { minWidth: isKompakt ? 20 : 24, height: isKompakt ? 20 : 24 } : undefined}
          >
            {pad(day)}
          </div>
        </div>
        <div className="day-mid min-w-0 flex-1">
          <div className={`desc truncate leading-snug text-[13px] ${desc ? 'text-text' : 'italic text-text-faint'} ${isKompakt ? 'text-[11px]' : ''}`}>
            {desc || TYP_LABEL[typ]}
          </div>
          {flags.length > 0 && <div className="day-flags mt-0.5 flex flex-wrap gap-1">{flags}</div>}
        </div>
        <div className="day-right flex-shrink-0 text-right text-[12px] text-text-muted">
          {minuten > 0 && <div className="stunden font-mono text-[13px] font-bold text-text">{fmtHHMM(minuten)}</div>}
          {sum > 0 && <div className={`sum font-mono text-[13px] font-bold text-text ${minuten > 0 ? 'mt-0.5' : ''}`}>{fmtEUR(sum)}&nbsp;€</div>}
        </div>
      </div>
    </div>
  );
}
