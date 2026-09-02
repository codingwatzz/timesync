// Zentrale Typdefinitionen für das gesamte Datenmodell.
// Eine Quelle der Wahrheit statt verstreuter Objekt-Literale wie im alten Code.

export type Wochentyp = 'A' | 'W' | 'F' | 'U' | 'K' | 'G';

export type Reiseland = 'Deutschland' | 'Österreich' | 'Schweiz';

export type Reiseart =
  | ''
  | 'Anreisetag'
  | 'Abreisetag'
  | 'Abwesenheitstag (<8h)'
  | 'Abwesenheitstag (>8h)'
  | 'Abwesenheitstag (24h)';

/** Ein einzelner Tageseintrag, wie er pro Datum gespeichert wird. */
export interface TagesEintrag {
  typ: Wochentyp;
  typManuell: boolean;
  ho: boolean; // Homeoffice
  start: string; // "HH:MM"
  ende: string; // "HH:MM"
  pause: string; // Minuten, als String (Formularfeld)
  // Zweite Schicht (z.B. abends nochmal gearbeitet, nach längerer Pause tagsüber).
  // Optional: leer, wenn nicht genutzt.
  start2: string;
  ende2: string;
  pause2: string;
  beschreibung: string;
  km: string;
  transport: string;
  hotel: string;
  bewirtung: string;
  sonstiges: string;
  reiseland: Reiseland;
  reiseart: Reiseart;
  fr: boolean; // Frühstück durch Firma bezahlt
  mi: boolean; // Mittagessen durch Firma bezahlt
  ab: boolean; // Abendessen durch Firma bezahlt
  receiptIds: string[];
}

/** Metadaten zu einem hochgeladenen Beleg (PDF). Das eigentliche PDF liegt im Storage-Backend. */
export interface BelegMeta {
  id: string;
  name: string;
  mime: string;
  createdAt: number;
  date: string; // YYYY-MM-DD, zu welchem Tag der Beleg gehört
  dataUrl?: string | null; // wird nur bei Bedarf nachgeladen (kann groß sein)
}

/** Eine Zeile im Export/Import-Format (kompatibel mit der bestehenden Excel-Übernahme). */
export interface ExportZeile extends TagesEintrag {
  date: string;
  receipts?: BelegMeta[];
}

export interface ExportDatei {
  format: 'zeiterfassung-export-v1';
  year: number;
  month: number;
  generatedAt: string;
  entries: ExportZeile[];
}
