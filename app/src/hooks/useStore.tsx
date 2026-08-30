import { useContext } from 'react';
import { StoreContext, type StoreContextValue } from './storeContextDefinition';

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore muss innerhalb von <StoreProvider> verwendet werden');
  return ctx;
}
