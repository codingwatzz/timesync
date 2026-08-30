import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { KVStore, StorageMode } from '../store/types';
import { createStore } from '../store/createStore';
import type { AppwriteConfig } from '../store/appwriteStore';

interface StoreContextValue {
  store: KVStore | null;
  mode: StorageMode;
  log: string[];
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ config, children }: { config: AppwriteConfig; children: ReactNode }) {
  const [store, setStore] = useState<KVStore | null>(null);
  const [mode, setMode] = useState<StorageMode>('ermittelt-noch');
  const [log, setLog] = useState<string[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return; // React StrictMode ruft Effekte doppelt auf
    initialized.current = true;

    function addLog(msg: string) {
      const line = `[${new Date().toLocaleTimeString('de-DE')}] ${msg}`;
      setLog((prev) => [...prev.slice(-59), line]);
    }

    createStore(config, addLog).then((result) => {
      setStore(result.store);
      setMode(result.mode);
    });
  }, [config]);

  return (
    <StoreContext.Provider value={{ store, mode, log }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore muss innerhalb von <StoreProvider> verwendet werden');
  return ctx;
}
