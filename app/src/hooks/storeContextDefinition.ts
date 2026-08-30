import { createContext } from 'react';
import type { KVStore, StorageMode } from '../store/types';

export interface StoreContextValue {
  store: KVStore | null;
  mode: StorageMode;
  log: string[];
}

export const StoreContext = createContext<StoreContextValue | null>(null);
