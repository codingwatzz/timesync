// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonthView } from '../MonthView';
import { emptyEntry } from '../../core/entry';
import type { TagesEintrag } from '../../core/types';

function noop() {}

describe('MonthView Kosten-Summe', () => {
  it('zählt "Sonstiges €" an einem Wochenendtag in die Monats-Summe mit (Regression: Deutschlandticket am 01.08.)', () => {
    // Genau der real gemeldete Fall: 01.08.2026 (Samstag) 63€ Sonstiges, 04.08.2026 6,40€ Sonstiges.
    const entries: Record<string, TagesEintrag> = {
      '2026-08-01': { ...emptyEntry(2026, 8, 1), typ: 'W', sonstiges: '63' },
      '2026-08-04': { ...emptyEntry(2026, 8, 4), typ: 'A', ho: false, sonstiges: '6.40' },
    };
    render(
      <MonthView
        year={2026} month={8} entries={entries} syncMode="appwrite"
        onPrevMonth={noop} onNextMonth={noop} onOpenDay={noop} onExport={noop} onImportFile={noop}
      />,
    );
    expect(screen.getByText('69,40')).toBeInTheDocument();
  });

  it('zählt "Vor Ort"-Tage weiterhin nur an echten Arbeitstagen ohne Homeoffice', () => {
    const entries: Record<string, TagesEintrag> = {
      '2026-08-01': { ...emptyEntry(2026, 8, 1), typ: 'W', sonstiges: '63' }, // Wochenende, kein "vor Ort"
      '2026-08-03': { ...emptyEntry(2026, 8, 3), typ: 'A', ho: true, km: '10' }, // Homeoffice, kein "vor Ort"
      '2026-08-04': { ...emptyEntry(2026, 8, 4), typ: 'A', ho: false, km: '20' }, // echter "vor Ort"-Tag
    };
    // Nur der 04.08. zählt als "vor Ort" (km-Summe = 20, nicht 30) - Klasse .n grenzt auf die
    // Kennzahl in der Summary-Strip-Pille ein (Tag 20 im Monat rendert sonst ebenfalls "20").
    const { container } = render(
      <MonthView
        year={2026} month={8} entries={entries} syncMode="appwrite"
        onPrevMonth={noop} onNextMonth={noop} onOpenDay={noop} onExport={noop} onImportFile={noop}
      />,
    );
    const kmPill = Array.from(container.querySelectorAll('.summary-strip .pill')).find((p) => p.textContent?.includes('km'));
    expect(kmPill?.querySelector('.n')?.textContent).toBe('20');
  });

  it('ruft onNextMonth/onPrevMonth beim Klick auf die Navigationspfeile auf', () => {
    const onNextMonth = vi.fn();
    const onPrevMonth = vi.fn();
    render(
      <MonthView
        year={2026} month={8} entries={{}} syncMode="appwrite"
        onPrevMonth={onPrevMonth} onNextMonth={onNextMonth} onOpenDay={noop} onExport={noop} onImportFile={noop}
      />,
    );
    screen.getByText('›').click();
    screen.getByText('‹').click();
    expect(onNextMonth).toHaveBeenCalledOnce();
    expect(onPrevMonth).toHaveBeenCalledOnce();
  });

  it('wechselt per Wisch-Geste nach links zum nächsten Monat', () => {
    const onNextMonth = vi.fn();
    const { container } = render(
      <MonthView
        year={2026} month={8} entries={{}} syncMode="appwrite"
        onPrevMonth={noop} onNextMonth={onNextMonth} onOpenDay={noop} onExport={noop} onImportFile={noop}
      />,
    );
    const main = container.querySelector('main')!;
    fireEvent.touchStart(main, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 150, clientY: 200 }] });
    expect(onNextMonth).toHaveBeenCalledOnce();
  });

  it('wechselt per Wisch-Geste nach rechts zum vorigen Monat', () => {
    const onPrevMonth = vi.fn();
    const { container } = render(
      <MonthView
        year={2026} month={8} entries={{}} syncMode="appwrite"
        onPrevMonth={onPrevMonth} onNextMonth={noop} onOpenDay={noop} onExport={noop} onImportFile={noop}
      />,
    );
    const main = container.querySelector('main')!;
    fireEvent.touchStart(main, { touches: [{ clientX: 100, clientY: 200 }] });
    fireEvent.touchEnd(main, { changedTouches: [{ clientX: 250, clientY: 200 }] });
    expect(onPrevMonth).toHaveBeenCalledOnce();
  });

  it('zeigt den Titel "Zeiterfassung" OHNE das frühere "Ledger"-Label daneben', () => {
    render(
      <MonthView
        year={2026} month={8} entries={{}} syncMode="appwrite"
        onPrevMonth={noop} onNextMonth={noop} onOpenDay={noop} onExport={noop} onImportFile={noop}
      />,
    );
    expect(screen.getByText('Zeiterfassung')).toBeInTheDocument();
    expect(screen.queryByText('Ledger')).not.toBeInTheDocument();
  });
});
