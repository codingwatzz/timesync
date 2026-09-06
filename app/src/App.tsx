import { useState } from 'react';
import { useStore } from './hooks/useStore';
import { useMonthEntries } from './hooks/useMonthEntries';
import { useToast } from './hooks/useToast';
import { emptyEntry } from './core/entry';
import { dateKey as buildDateKey } from './core/holidays';
import { loadEntry } from './hooks/entryStorage';
import { MonthView } from './components/MonthView';
import { DetailSheet } from './components/DetailSheet';
import { ExportView } from './components/ExportView';
import { Toast } from './components/Toast';
import { ImportConfirmDialog } from './components/ImportConfirmDialog';
import { parseImportFile } from './lib/exportImport';
import { buildImportPlan, applyImportPlan } from './lib/importPlan';
import type { ImportPlan } from './lib/importPlan';
import type { TagesEintrag } from './core/types';

type View = 'month' | 'detail' | 'export';

export default function App() {
  const { store, mode, log } = useStore();
  const { year, month, entries, changeMonth, saveEntry, reload } = useMonthEntries();
  const { toastMessage, showToast } = useToast();

  const [view, setView] = useState<View>('month');
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  // Wird gesetzt, wenn per Wisch-Geste zu einem Tag außerhalb des gerade geladenen Monats
  // gewechselt wird - entries (aus useMonthEntries) ist nur für den aktuell geladenen Monat
  // gefüllt, changeMonth() lädt den neuen Monat erst asynchron nach. Ohne diesen Zwischenstand
  // würde kurzzeitig fälschlich ein leerer Tag angezeigt, bevor der neue Monat nachgeladen ist.
  const [crossMonthEntry, setCrossMonthEntry] = useState<TagesEintrag | null>(null);
  // Import läuft zweistufig (siehe UX-Review 06.09.2026, Punkt 4.1): erst nur parsen +
  // prüfen, was überschrieben würde (importPlan gesetzt = Bestätigungsdialog offen), erst
  // NACH expliziter Bestätigung wird tatsächlich geschrieben. Ersetzt das vorherige Verhalten,
  // bei dem eine ausgewählte Datei sofort und ohne Rückfrage geschrieben wurde.
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);

  function openDay(key: string) {
    setCrossMonthEntry(null);
    setOpenDayKey(key);
    setView('detail');
  }

  async function navigateDay(delta: 1 | -1) {
    if (!openDayKey) return;
    const [y, m, d] = openDayKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d + delta);
    const newKey = buildDateKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    const sameMonth = dt.getFullYear() === year && dt.getMonth() + 1 === month;
    if (!sameMonth) {
      // Direkt laden statt auf den Monats-Reload zu warten - vermeidet ein kurzes
      // fälschliches "leerer Tag" während changeMonth() im Hintergrund nachlädt.
      const loaded = store ? await loadEntry(store, newKey) : null;
      setCrossMonthEntry(loaded);
      changeMonth(delta);
    } else {
      setCrossMonthEntry(null);
    }
    setOpenDayKey(newKey);
  }

  function closeDetail() {
    setOpenDayKey(null);
    setCrossMonthEntry(null);
    setView('month');
  }

  function handleExport() {
    setView('export');
  }

  // Schritt 1: Datei nur parsen + prüfen, was überschrieben würde - noch KEIN Schreibzugriff.
  async function handleImportFile(file: File) {
    if (!store) return;
    const parsed = await parseImportFile(file);
    if (parsed.error) {
      showToast(parsed.error);
      return;
    }
    const plan = await buildImportPlan(store, parsed.candidates);
    setImportPlan(plan);
  }

  // Schritt 2: erst NACH expliziter Bestätigung im ImportConfirmDialog wird wirklich
  // geschrieben.
  async function handleConfirmImport() {
    if (!importPlan) return;
    const plan = importPlan;
    setImportPlan(null);
    showToast('Importiere…');
    const count = await applyImportPlan(plan, saveEntry);
    // Erst neu laden, DANN die Erfolgsmeldung zeigen - sonst könnte der Nutzer (oder ein
    // Test) auf die Meldung reagieren, bevor die importierten Daten wirklich sichtbar sind.
    await reload();
    const ueberschrieben = plan.overwriteKeys.length;
    showToast(
      `${count} Eintrag${count !== 1 ? 'e' : ''} importiert` +
      (ueberschrieben > 0 ? ` (${ueberschrieben} überschrieben)` : ''),
    );
  }

  const [oy, om, od] = openDayKey ? openDayKey.split('-').map(Number) : [0, 0, 0];
  const openEntry = openDayKey
    ? (crossMonthEntry ?? entries[openDayKey] ?? emptyEntry(oy, om, od))
    : null;

  return (
    <div id="app">
      {view === 'export' ? (
        <ExportView
          year={year} month={month} entries={entries} store={store}
          onBack={() => setView('month')}
          showToast={showToast}
        />
      ) : (
        <MonthView
          year={year} month={month} entries={entries} syncMode={mode} log={log}
          onPrevMonth={() => changeMonth(-1)}
          onNextMonth={() => changeMonth(1)}
          onOpenDay={openDay}
          onExport={handleExport}
          onImportFile={handleImportFile}
        />
      )}

      {view === 'detail' && openDayKey && openEntry && (
        <DetailSheet
          key={openDayKey}
          dateKey={openDayKey}
          entry={openEntry}
          onSave={saveEntry}
          onClose={closeDetail}
          onNavigateDay={navigateDay}
          showToast={showToast}
        />
      )}

      <Toast message={toastMessage} />
      <ImportConfirmDialog
        plan={importPlan}
        onCancel={() => setImportPlan(null)}
        onConfirm={handleConfirmImport}
      />
    </div>
  );
}
