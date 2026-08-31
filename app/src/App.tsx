import { useState } from 'react';
import { useStore } from './hooks/useStore';
import { useMonthEntries } from './hooks/useMonthEntries';
import { useToast } from './hooks/useToast';
import { emptyEntry } from './core/entry';
import { MonthView } from './components/MonthView';
import { DetailSheet } from './components/DetailSheet';
import { ExportView } from './components/ExportView';
import { DiagnosePanel } from './components/DiagnosePanel';
import { Toast } from './components/Toast';
import { buildExportRows, buildExportPayload, downloadExportFile, importFromFile } from './lib/exportImport';
import type { ExportZeile } from './core/types';

type View = 'month' | 'detail' | 'export';

export default function App() {
  const { store, mode, log } = useStore();
  const { year, month, entries, changeMonth, saveEntry, reload } = useMonthEntries();
  const { toastMessage, showToast } = useToast();

  const [view, setView] = useState<View>('month');
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [exportData, setExportData] = useState<{ rows: ExportZeile[]; receiptCount: number } | null>(null);

  function openDay(key: string) {
    setOpenDayKey(key);
    setView('detail');
  }

  function closeDetail() {
    setOpenDayKey(null);
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
  const openEntry = openDayKey ? (entries[openDayKey] ?? emptyEntry(oy, om, od)) : null;

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
          dateKey={openDayKey}
          entry={openEntry}
          onSave={saveEntry}
          onClose={closeDetail}
          showToast={showToast}
        />
      )}

      <Toast message={toastMessage} />
      <DiagnosePanel mode={mode} log={log} />
    </div>
  );
}
// Trigger: Monats-Vergleichs-Diagnose verifizieren
