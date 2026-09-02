import { WOCHENTAGE, TYP_LABEL } from '../core/constants';
import { pad, toNumber } from '../core/formatters';
import { tagesKosten, istVorOrtTag } from '../core/entry';
import { fmtEUR } from '../core/formatters';
import type { TagesEintrag } from '../core/types';

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
  if (entry?.ho) flags.push(<span key="ho" className="flag ho">Homeoffice</span>);
  const vorOrt = istVorOrtTag(entry);
  if (vorOrt) flags.push(<span key="trip" className="flag trip">extern</span>);
  if (vorOrt && !entry?.reiseart) flags.push(<span key="warn" className="flag warn">⚠ Reiseart fehlt</span>);
  const km = toNumber(entry?.km);
  if (km > 0) flags.push(<span key="km" className="flag km">{km} km</span>);
  if (entry?.receiptIds?.length) {
    flags.push(
      <span key="receipt" className="flag receipt">
        {entry.receiptIds.length} Beleg{entry.receiptIds.length > 1 ? 'e' : ''}
      </span>,
    );
  }

  const desc = entry?.beschreibung || feiertag || '';
  const sum = entry ? tagesKosten(entry) : 0;

  return (
    <div className={`day-row${isWeekend ? ' weekend' : ''}${isToday ? ' today' : ''}`} onClick={onClick}>
      <div className={`tab ${typ}`} />
      <div className="day-body">
        <div className="day-date">
          <div className="dow">{dow}</div>
          <div className={`num${isToday ? ' today' : ''}`}>{pad(day)}</div>
        </div>
        <div className="day-mid">
          <div className={`desc${desc ? '' : ' empty'}`}>{desc || TYP_LABEL[typ]}</div>
          <div className="day-flags">{flags}</div>
        </div>
        <div className="day-right">
          {sum > 0 && <div className="sum">{fmtEUR(sum)}&nbsp;€</div>}
        </div>
      </div>
    </div>
  );
}
