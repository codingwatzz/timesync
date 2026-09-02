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
import { DiagnosePanel } from './components/DiagnosePanel';
import { Toast } from './components/Toast';
import { buildExportRows, buildExportPayload, downloadExportFile, importFromFile } from './lib/exportImport';
import type { ExportZeile, TagesEintrag } from './core/types';

type View = 'month' | 'detail' | 'export';

export default function App() {
  const { store, mode, log } = useStore();
  const { year, month, entries, changeMonth, saveEntry, reload } = useMonthEntries();
  const { toastMessage, showToast } = useToast();

  const [view, setView] = useState<View>('month');
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [exportData, setExportData] = useState<{ rows: ExportZeile[]; receiptCount: number } | null>(null);
  // Wird gesetzt, wenn per Wisch-Geste zu einem Tag außerhalb des gerade geladenen Monats
  // gewechselt wird - entries (aus useMonthEntries) ist nur für den aktuell geladenen Monat
  // gefüllt, changeMonth() lädt den neuen Monat erst asynchron nach. Ohne diesen Zwischenstand
  // würde kurzzeitig fälschlich ein leerer Tag angezeigt, bevor der neue Monat nachgeladen ist.
  const [crossMonthEntry, setCrossMonthEntry] = useState<TagesEintrag | null>(null);

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

  async function handleExport() {
    if (!store) return;
    const result = await buildExportRows(store, year, month, entries);
    setExportData(result);
    setView('export');
  }

  function handleDownload() {
    if (!exportData) return;
    downloadExportFile(buildExportPayload(year, month, exportData.rows));
    showToast('Export heruntergeladen');
  }

  async function handleImportFile(file: File) {
    if (!store) return;
    showToast('Importiere…');
    const result = await importFromFile(file, saveEntry);
    if (result.error) {
      showToast('Import fehlgeschlagen – siehe Diagnose-Button unten rechts');
    } else {
      // Erst neu laden, DANN die Erfolgsmeldung zeigen - sonst könnte der Nutzer (oder ein
      // Test) auf die Meldung reagieren, bevor die importierten Daten wirklich sichtbar sind.
      await reload();
      showToast(`${result.count} Einträge importiert`);
    }
  }

  const [oy, om, od] = openDayKey ? openDayKey.split('-').map(Number) : [0, 0, 0];
  const openEntry = openDayKey
    ? (crossMonthEntry ?? entries[openDayKey] ?? emptyEntry(oy, om, od))
    : null;

  return (
    <div id="app">
      {view === 'export' && exportData ? (
        <ExportView
          year={year} month={month}
          rows={exportData.rows} receiptCount={exportData.receiptCount}
          onBack={() => setView('month')}
          onDownload={handleDownload}
        />
      ) : (
        <MonthView
          year={year} month={month} entries={entries} syncMode={mode}
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
      <DiagnosePanel mode={mode} log={log} />
    </div>
  );
}
