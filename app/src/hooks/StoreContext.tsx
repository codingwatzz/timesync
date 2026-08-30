import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createStore } from '../store/createStore';
import type { AppwriteConfig } from '../store/appwriteStore';
import { StoreContext, type StoreContextValue } from './storeContextDefinition';
import type { StorageMode } from '../store/types';

export function StoreProvider({ config, children }: { config: AppwriteConfig; children: ReactNode }) {
  const [store, setStore] = useState<StoreContextValue['store']>(null);
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
