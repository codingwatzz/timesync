import type { KVStore } from '../store/types';
import type { TagesEintrag } from '../core/types';
import type { BelegMeta } from '../core/types';

export async function loadEntry(store: KVStore, key: string): Promise<TagesEintrag | null> {
  const r = await store.get(`entry:${key}`);
  return r ? (JSON.parse(r.value) as TagesEintrag) : null;
}

export async function saveEntry(store: KVStore, key: string, data: TagesEintrag): Promise<void> {
  await store.set(`entry:${key}`, JSON.stringify(data));
}

export async function loadReceipt(store: KVStore, id: string): Promise<BelegMeta | null> {
  const r = await store.get(`receipt:${id}`);
  return r ? (JSON.parse(r.value) as BelegMeta) : null;
}

export async function saveReceipt(store: KVStore, id: string, data: BelegMeta): Promise<void> {
  await store.set(`receipt:${id}`, JSON.stringify(data));
}

export async function deleteReceipt(store: KVStore, id: string): Promise<void> {
  await store.delete(`receipt:${id}`);
}
