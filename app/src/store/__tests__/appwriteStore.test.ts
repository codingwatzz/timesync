// @vitest-environment jsdom
//
// Engineering-Review 07.09.2026, Punkt 2/7: appwriteStore.ts war bisher die einzige zentrale
// Store-Datei OHNE eigenen Unit-Test (einziges Sicherheitsnetz war der tägliche/manuelle
// E2E-Lauf gegen echtes Appwrite). Hier wird der Appwrite-Client komplett gemockt, damit das
// Fehlerverhalten (get/set/delete werfen bei echten Fehlern, nicht bei "nicht gefunden")
// isoliert und schnell testbar ist.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getRow = vi.fn();
const updateRow = vi.fn();
const createRow = vi.fn();
const deleteRow = vi.fn();
const getFileDownload = vi.fn(() => 'https://example.invalid/download');
const deleteFile = vi.fn();
const createFile = vi.fn();

vi.mock('appwrite', () => ({
  Client: class {
    setEndpoint() { return this; }
    setProject() { return this; }
  },
  TablesDB: class {
    getRow = getRow;
    updateRow = updateRow;
    createRow = createRow;
    deleteRow = deleteRow;
  },
  Storage: class {
    getFileDownload = getFileDownload;
    deleteFile = deleteFile;
    createFile = createFile;
  },
}));

const { createAppwriteStore } = await import('../appwriteStore');

const CONFIG = { endpoint: 'https://example.invalid/v1', projectId: 'p', databaseId: 'd', tableId: 't', bucketId: 'b' };

function notFoundError(): Error & { code: number } {
  return Object.assign(new Error('not found'), { code: 404 });
}
function realError(): Error & { code: number } {
  return Object.assign(new Error('boom'), { code: 500 });
}

describe('createAppwriteStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRow.mockRejectedValue(notFoundError()); // Verbindungstest im Setup erwartet 404 = OK
  });

  it('get(): liefert null, wenn die Zeile wirklich nicht existiert (404)', async () => {
    const store = await createAppwriteStore(CONFIG, () => {});
    getRow.mockRejectedValueOnce(notFoundError());
    await expect(store.get('entry:2028-12-01')).resolves.toBeNull();
  });

  it('get(): wirft bei einem ECHTEN Fehler, statt null zurückzugeben', async () => {
    const store = await createAppwriteStore(CONFIG, () => {});
    getRow.mockRejectedValueOnce(realError());
    await expect(store.get('entry:2028-12-01')).rejects.toThrow('boom');
  });

  it('set(): legt eine neue Zeile per createRow an, wenn updateRow mit 404 fehlschlägt', async () => {
    const store = await createAppwriteStore(CONFIG, () => {});
    updateRow.mockRejectedValueOnce(notFoundError());
    createRow.mockResolvedValueOnce({});
    await store.set('entry:2028-12-01', '{}');
    expect(createRow).toHaveBeenCalledTimes(1);
  });

  it('set(): wirft bei einem ECHTEN Update-Fehler, OHNE auf createRow auszuweichen', async () => {
    const store = await createAppwriteStore(CONFIG, () => {});
    updateRow.mockRejectedValueOnce(realError());
    await expect(store.set('entry:2028-12-01', '{}')).rejects.toThrow('boom');
    expect(createRow).not.toHaveBeenCalled();
  });

  it('set() für einen Beleg: wirft, wenn der Datei-Upload fehlschlägt, statt die Metadaten-Zeile trotzdem zu schreiben', async () => {
    const store = await createAppwriteStore(CONFIG, () => {});
    // fetch für den dataUrl->Blob-Schritt mocken
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['x']) })));
    deleteFile.mockRejectedValueOnce(notFoundError()); // "gab noch keine alte Datei" ist normal
    createFile.mockRejectedValueOnce(realError());
    await expect(
      store.set('receipt:r1', JSON.stringify({ id: 'r1', name: 'beleg.pdf', dataUrl: 'data:application/pdf;base64,eA==' })),
    ).rejects.toThrow('boom');
    expect(updateRow).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('get(): wirft, wenn der Beleg-Datei-Download einen HTTP-Fehler liefert, statt die Fehlerantwort als Dateiinhalt zu übernehmen', async () => {
    const store = await createAppwriteStore(CONFIG, () => {});
    getRow.mockResolvedValueOnce({ value: JSON.stringify({ id: 'r1', name: 'beleg.pdf' }) });
    // fetch() schlägt bei HTTP-Fehlercodes NICHT fehl (nur bei echten Netzwerkfehlern) - resp.ok
    // muss explizit geprüft werden. Dieser Test bildet genau den real aufgetretenen Fall vom
    // 07.09.2026 nach: ein Download schlägt mit 401 fehl, die Fehler-JSON darf NICHT
    // stillschweigend als Beleg-Inhalt übernommen werden (siehe get()-Kommentar).
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 401, blob: async () => new Blob([JSON.stringify({ message: 'nope' })], { type: 'application/json' }),
    })));
    const result = await store.get('receipt:r1');
    // get() fängt den Download-Fehler ab (siehe Kommentar dort: Metadaten sind trotzdem
    // nutzbar) - aber dataUrl MUSS null bleiben, darf NIE die Fehlerantwort enthalten.
    expect(result).not.toBeNull();
    expect(JSON.parse(result!.value).dataUrl).toBeNull();
    vi.unstubAllGlobals();
  });

  it('set() für einen Beleg: verweigert den Upload, wenn der Blob-Typ nicht application/pdf ist (Korruptionsschutz)', async () => {
    const store = await createAppwriteStore(CONFIG, () => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, blob: async () => new Blob(['{"message":"nope"}'], { type: 'application/json' }),
    })));
    await expect(
      store.set('receipt:r1', JSON.stringify({ id: 'r1', name: 'beleg.pdf', dataUrl: 'data:application/json;base64,eA==' })),
    ).rejects.toThrow(/unerwarteten Typ/);
    expect(createFile).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('delete(): behandelt eine bereits nicht (mehr) vorhandene Zeile als Erfolg', async () => {
    const store = await createAppwriteStore(CONFIG, () => {});
    deleteRow.mockRejectedValueOnce(notFoundError());
    await expect(store.delete('entry:2028-12-01')).resolves.toEqual({ key: 'entry:2028-12-01', deleted: true });
  });

  it('delete(): wirft bei einem ECHTEN Löschfehler', async () => {
    const store = await createAppwriteStore(CONFIG, () => {});
    deleteRow.mockRejectedValueOnce(realError());
    await expect(store.delete('entry:2028-12-01')).rejects.toThrow('boom');
  });
});
