import { useState } from 'react';
import { entriesToZeilen } from '../lib/export/exportZeilen';
import { berechneArbeitszeit } from '../core/arbeitszeit';
import { SpesenPreviewTable } from './SpesenPreviewTable';
import { ArbeitszeitPreviewTable } from './ArbeitszeitPreviewTable';
import type { TagesEintrag } from '../core/types';

interface MonthPreviewsProps {
  year: number;
  month: number;
  entries: Record<string, TagesEintrag>;
}

type OffenesPanel = 'spesen' | 'arbeitszeit' | null;

/** Ausklappbare Vorschau auf Spesenabrechnung und Arbeitszeiten-Übersicht des laufenden
 * Monats, OHNE dafür eine Datei zu erzeugen - reine In-Memory-Berechnung aus den ohnehin
 * schon geladenen `entries` (kein Store-/Netzwerk-Zugriff nötig, anders als beim tatsächlichen
 * Export, der auch Belege lädt). Bewusst nur ein Panel gleichzeitig offen (Akkordeon), damit
 * bei zwei potenziell langen Tabellen nicht die ganze Seite überladen wirkt. */
export function MonthPreviews({ year, month, entries }: MonthPreviewsProps) {
  const [offen, setOffen] = useState<OffenesPanel>(null);

  function toggle(panel: OffenesPanel) {
    setOffen((aktuell) => (aktuell === panel ? null : panel));
  }

  return (
    <div className="month-previews">
      <button className="preview-toggle" id="spesenPreviewToggle" onClick={() => toggle('spesen')}>
        🧾 Spesenabrechnung-Vorschau {offen === 'spesen' ? '▴' : '▾'}
      </button>
      {offen === 'spesen' && (
        <div className="preview-panel">
          <SpesenPreviewTable zeilen={entriesToZeilen(year, month, entries)} />
        </div>
      )}

      <button className="preview-toggle" id="arbeitszeitPreviewToggle" onClick={() => toggle('arbeitszeit')}>
        📊 Arbeitszeiten-Vorschau {offen === 'arbeitszeit' ? '▴' : '▾'}
      </button>
      {offen === 'arbeitszeit' && (
        <div className="preview-panel">
          <ArbeitszeitPreviewTable berechnung={berechneArbeitszeit(year, month, entries)} />
        </div>
      )}
    </div>
  );
}
