import { describe, it, expect, vi } from 'vitest';
import { importFromFile } from '../exportImport';

function fakeFile(content: unknown): File {
  return { text: async () => JSON.stringify(content) } as unknown as File;
}

describe('importFromFile', () => {
  it('importiert Einträge aus dem {entries: [...]}-Format (Export-Datei-Format)', async () => {
    const saveEntry = vi.fn();
    const file = fakeFile({
      entries: [{ date: '2028-12-01', typ: 'A', ho: false, beschreibung: 'Test', km: 50 }],
    });
    const result = await importFromFile(file, saveEntry);
    expect(result.count).toBe(1);
    expect(result.error).toBeUndefined();
    expect(saveEntry).toHaveBeenCalledWith('2028-12-01', expect.objectContaining({ beschreibung: 'Test', km: '50' }));
  });

  it('importiert auch aus einem rohen Array (ohne {entries: ...}-Wrapper)', async () => {
    const saveEntry = vi.fn();
    const file = fakeFile([{ date: '2028-12-02', typ: 'A' }]);
    const result = await importFromFile(file, saveEntry);
    expect(result.count).toBe(1);
  });

  it('überspringt Zeilen ohne Datum', async () => {
    const saveEntry = vi.fn();
    const file = fakeFile({ entries: [{ typ: 'A' }, { date: '2028-12-03', typ: 'A' }] });
    const result = await importFromFile(file, saveEntry);
    expect(result.count).toBe(1);
  });

  it('setzt sinnvolle Defaults für fehlende Felder', async () => {
    const saveEntry = vi.fn();
    const file = fakeFile({ entries: [{ date: '2028-12-04' }] });
    await importFromFile(file, saveEntry);
    const [, entry] = saveEntry.mock.calls[0];
    expect(entry.typ).toBe('A');
    expect(entry.ho).toBe(false);
    expect(entry.reiseland).toBe('Deutschland');
    expect(entry.receiptIds).toEqual([]);
  });

  it('gibt einen Fehler zurück bei ungültigem JSON, statt zu crashen', async () => {
    const saveEntry = vi.fn();
    const file = { text: async () => 'kein json {{{' } as unknown as File;
    const result = await importFromFile(file, saveEntry);
    expect(result.count).toBe(0);
    expect(result.error).toBeTruthy();
  });

  it('gibt einen Fehler zurück, wenn kein entries-Array gefunden wird', async () => {
    const saveEntry = vi.fn();
    const file = fakeFile({ format: 'irgendwas' });
    const result = await importFromFile(file, saveEntry);
    expect(result.count).toBe(0);
    expect(result.error).toMatch(/Ungültiges Format/);
  });
});
