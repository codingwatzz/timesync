import { describe, it, expect } from 'vitest';
import { parseImportFile } from '../exportImport';

function fakeFile(content: unknown): File {
  return { text: async () => JSON.stringify(content) } as unknown as File;
}

describe('parseImportFile', () => {
  it('parst Einträge aus dem {entries: [...]}-Format (Export-Datei-Format), OHNE zu schreiben', async () => {
    const file = fakeFile({
      entries: [{ date: '2028-12-01', typ: 'A', ho: false, beschreibung: 'Test', km: 50 }],
    });
    const result = await parseImportFile(file);
    expect(result.error).toBeUndefined();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({ key: '2028-12-01', data: expect.objectContaining({ beschreibung: 'Test', km: '50' }) }),
    );
  });

  it('parst auch aus einem rohen Array (ohne {entries: ...}-Wrapper)', async () => {
    const file = fakeFile([{ date: '2028-12-02', typ: 'A' }]);
    const result = await parseImportFile(file);
    expect(result.error).toBeUndefined();
    expect(result.candidates).toHaveLength(1);
  });

  it('überspringt Zeilen ohne Datum', async () => {
    const file = fakeFile({ entries: [{ typ: 'A' }, { date: '2028-12-03', typ: 'A' }] });
    const result = await parseImportFile(file);
    expect(result.candidates).toHaveLength(1);
  });

  it('setzt sinnvolle Defaults für fehlende Felder', async () => {
    const file = fakeFile({ entries: [{ date: '2028-12-04' }] });
    const result = await parseImportFile(file);
    const { data } = result.candidates[0];
    expect(data.typ).toBe('A');
    expect(data.ho).toBe(false);
    expect(data.reiseland).toBe('Deutschland');
    expect(data.receiptIds).toEqual([]);
  });

  it('gibt einen Fehler zurück bei ungültigem JSON, statt zu crashen', async () => {
    const file = { text: async () => 'kein json {{{' } as unknown as File;
    const result = await parseImportFile(file);
    expect(result.candidates).toHaveLength(0);
    expect(result.error).toBeTruthy();
  });

  it('gibt einen Fehler zurück, wenn kein entries-Array gefunden wird', async () => {
    const file = fakeFile({ format: 'irgendwas' });
    const result = await parseImportFile(file);
    expect(result.candidates).toHaveLength(0);
    expect(result.error).toMatch(/Ungültiges Format/);
  });

  it('gibt einen Fehler zurück, wenn das entries-Array keine gültigen Einträge enthält', async () => {
    const file = fakeFile({ entries: [{ typ: 'A' }] });
    const result = await parseImportFile(file);
    expect(result.candidates).toHaveLength(0);
    expect(result.error).toBeTruthy();
  });
});
