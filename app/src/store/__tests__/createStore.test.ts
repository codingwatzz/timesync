import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Appwrite-SDK komplett simulieren, damit die Tests ohne echtes Netzwerk laufen.
const getRowMock = vi.fn();
vi.mock('appwrite', () => {
  class FakeClient {
    setEndpoint() { return this; }
    setProject() { return this; }
  }
  class FakeTablesDB {
    getRow = getRowMock;
    createRow = vi.fn();
    updateRow = vi.fn();
    deleteRow = vi.fn();
  }
  class FakeStorage {
    getFileDownload = vi.fn();
    createFile = vi.fn();
    deleteFile = vi.fn();
  }
  return { Client: FakeClient, TablesDB: FakeTablesDB, Storage: FakeStorage };
});

const { createStore } = await import('../createStore');

const DUMMY_CONFIG = {
  endpoint: 'https://example.invalid/v1',
  projectId: 'p',
  databaseId: 'd',
  tableId: 't',
  bucketId: 'b',
};

describe('createStore', () => {
  beforeEach(() => {
    getRowMock.mockReset();
  });

  it('wählt Appwrite, wenn der Verbindungstest mit 404 (nicht gefunden) fehlschlägt', async () => {
    getRowMock.mockRejectedValueOnce({ code: 404, message: 'not found' });
    const { mode } = await createStore(DUMMY_CONFIG);
    expect(mode).toBe('appwrite');
  });

  it('wählt Appwrite, wenn der Verbindungstest erfolgreich ist', async () => {
    getRowMock.mockResolvedValueOnce({ value: '{}' });
    const { mode } = await createStore(DUMMY_CONFIG);
    expect(mode).toBe('appwrite');
  });

  it('fällt auf IndexedDB zurück, wenn Appwrite einen echten Fehler wirft (z.B. 401)', async () => {
    getRowMock.mockRejectedValueOnce({ code: 401, message: 'Unauthorized' });
    const { mode, store } = await createStore(DUMMY_CONFIG);
    expect(mode).toBe('indexeddb');
    // Store sollte trotzdem benutzbar sein (Fallback funktioniert wirklich)
    await store.set('test:1', 'hallo');
    const result = await store.get('test:1');
    expect(result?.value).toBe('hallo');
  });

  it('ruft den Logger mit aussagekräftigen Meldungen auf', async () => {
    getRowMock.mockRejectedValueOnce({ code: 404, message: 'not found' });
    const messages: string[] = [];
    await createStore(DUMMY_CONFIG, (msg) => messages.push(msg));
    expect(messages.some((m) => m.includes('Appwrite Cloud-Sync (aktiv)'))).toBe(true);
  });
});
