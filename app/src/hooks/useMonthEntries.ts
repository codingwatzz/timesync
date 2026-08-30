import { useCallback, useEffect, useState } from 'react';
import { useStore } from './useStore';
import { dateKey } from '../core/holidays';
import { daysInMonth } from '../core/formatters';
import { loadEntry, saveEntry as saveEntryToStore } from './entryStorage';
import type { TagesEintrag } from '../core/types';

export interface MonthState {
  year: number;
  month: number; // 1-12
  entries: Record<string, TagesEintrag>;
  loading: boolean;
}

export function useMonthEntries() {
  const { store } = useStore();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [entries, setEntries] = useState<Record<string, TagesEintrag>>({});
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    const n = daysInMonth(year, month);
    const keys = Array.from({ length: n }, (_, i) => dateKey(year, month, i + 1));
    const results = await Promise.all(keys.map((k) => loadEntry(store, k)));
    const next: Record<string, TagesEintrag> = {};
    keys.forEach((k, i) => {
      const e = results[i];
      if (e) next[k] = e;
    });
    setEntries(next);
    setLoading(false);
  }, [store, year, month]);

  useEffect(() => {
    reload();
  }, [reload]);

  const changeMonth = useCallback((delta: number) => {
    setMonth((prevMonth) => {
      let m = prevMonth + delta;
      let y = year;
      if (m > 12) { m = 1; y += 1; }
      if (m < 1) { m = 12; y -= 1; }
      setYear(y);
      return m;
    });
  }, [year]);

  const saveEntry = useCallback(async (key: string, data: TagesEintrag) => {
    if (!store) return;
    await saveEntryToStore(store, key, data);
    setEntries((prev) => ({ ...prev, [key]: data }));
  }, [store]);

  return { year, month, entries, loading, changeMonth, reload, saveEntry };
}
