import { useEffect, useState } from 'react';
import { Receipt, BarChart3, ChevronUp, ChevronDown } from 'lucide-react';
import { entriesToZeilen } from '../lib/export/exportZeilen';
import { berechneArbeitszeit } from '../core/arbeitszeit';
import { SpesenPreviewTable } from './SpesenPreviewTable';
import { ArbeitszeitPreviewTable } from './ArbeitszeitPreviewTable';
import type { TagesEintrag } from '../core/types';

interface MonthPreviewsProps {
  year: number;
  month: number;
  entries: Record<string, TagesEintrag>;
  // Meldet nach außen, ob gerade ein Panel aufgeklappt ist - der schwebende Export-Button in
  // MonthView verdeckt sonst Tabelleninhalte (siehe UX-Audit 05.09.2026, Punkt 13) und wird
  // deshalb genau in diesem Fall zu einem normalen, nicht-schwebenden Button.
  onOffenChange?: (offen: boolean) => void;
}

type OffenesPanel = 'spesen' | 'arbeitszeit' | null;

const toggleCls = 'mb-2 flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-3 text-left text-[13px] font-semibold text-text transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none';

/** Ausklappbare Vorschau auf Spesenabrechnung und Arbeitszeiten-Übersicht des laufenden
 * Monats, OHNE dafür eine Datei zu erzeugen - reine In-Memory-Berechnung aus den ohnehin
 * schon geladenen `entries` (kein Store-/Netzwerk-Zugriff nötig, anders als beim tatsächlichen
 * Export, der auch Belege lädt). Bewusst nur ein Panel gleichzeitig offen (Akkordeon), damit
 * bei zwei potenziell langen Tabellen nicht die ganze Seite überladen wirkt. */
export function MonthPreviews({ year, month, entries, onOffenChange }: MonthPreviewsProps) {
  const [offen, setOffen] = useState<OffenesPanel>(null);

  useEffect(() => {
    onOffenChange?.(offen !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offen]);

  function toggle(panel: OffenesPanel) {
    setOffen((aktuell) => (aktuell === panel ? null : panel));
  }

  return (
    <div className="month-previews mt-4 mb-24">
      <button className={toggleCls} id="spesenPreviewToggle" onClick={() => toggle('spesen')}>
        <Receipt size={15} strokeWidth={2.25} className="text-primary" />
        Spesenabrechnung-Vorschau
        {offen === 'spesen' ? <ChevronUp size={15} className="ml-auto" /> : <ChevronDown size={15} className="ml-auto" />}
      </button>
      {offen === 'spesen' && (
        <div className="preview-panel mb-3 overflow-x-auto rounded-lg border border-border bg-surface p-2.5">
          <SpesenPreviewTable zeilen={entriesToZeilen(year, month, entries)} />
        </div>
      )}

      <button className={toggleCls} id="arbeitszeitPreviewToggle" onClick={() => toggle('arbeitszeit')}>
        <BarChart3 size={15} strokeWidth={2.25} className="text-secondary" />
        Arbeitszeiten-Vorschau
        {offen === 'arbeitszeit' ? <ChevronUp size={15} className="ml-auto" /> : <ChevronDown size={15} className="ml-auto" />}
      </button>
      {offen === 'arbeitszeit' && (
        <div className="preview-panel mb-3 overflow-x-auto rounded-lg border border-border bg-surface p-2.5">
          <ArbeitszeitPreviewTable berechnung={berechneArbeitszeit(year, month, entries, new Date())} />
        </div>
      )}
    </div>
  );
}
