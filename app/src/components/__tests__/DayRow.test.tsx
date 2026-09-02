// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DayRow } from '../DayRow';
import { emptyEntry } from '../../core/entry';

describe('DayRow', () => {
  it('zeigt den Feiertagsnamen, wenn kein Eintrag vorhanden ist', () => {
    render(
      <DayRow year={2026} month={12} day={25} entry={undefined} typ="F"
        feiertag="1. Weihnachtsfeiertag" onClick={() => {}} />,
    );
    expect(screen.getByText('1. Weihnachtsfeiertag')).toBeInTheDocument();
  });

  it('zeigt die Notiz, falls vorhanden (hat Vorrang vor dem Feiertagsnamen)', () => {
    const entry = { ...emptyEntry(2026, 12, 25), beschreibung: 'Eigene Notiz' };
    render(
      <DayRow year={2026} month={12} day={25} entry={entry} typ="F"
        feiertag="1. Weihnachtsfeiertag" onClick={() => {}} />,
    );
    expect(screen.getByText('Eigene Notiz')).toBeInTheDocument();
    expect(screen.queryByText('1. Weihnachtsfeiertag')).not.toBeInTheDocument();
  });

  it('zeigt das Homeoffice-Flag, wenn ho=true', () => {
    const entry = { ...emptyEntry(2026, 8, 17), ho: true };
    render(<DayRow year={2026} month={8} day={17} entry={entry} typ="A" feiertag={null} onClick={() => {}} />);
    expect(screen.getByText('Homeoffice')).toBeInTheDocument();
  });

  it('zeigt die Reiseart-Warnung bei "vor Ort"-Tag ohne gesetzte Reiseart', () => {
    const entry = { ...emptyEntry(2026, 8, 17), ho: false, typ: 'A' as const, km: '50' };
    render(<DayRow year={2026} month={8} day={17} entry={entry} typ="A" feiertag={null} onClick={() => {}} />);
    expect(screen.getByText('⚠ Reiseart fehlt')).toBeInTheDocument();
  });

  it('zeigt KEINE Reiseart-Warnung, wenn eine Reiseart gesetzt ist', () => {
    const entry = { ...emptyEntry(2026, 8, 17), ho: false, typ: 'A' as const, km: '50', reiseart: 'Anreisetag' as const };
    render(<DayRow year={2026} month={8} day={17} entry={entry} typ="A" feiertag={null} onClick={() => {}} />);
    expect(screen.queryByText('⚠ Reiseart fehlt')).not.toBeInTheDocument();
  });

  it('ruft onClick auf, wenn die Zeile angeklickt wird', () => {
    const onClick = vi.fn();
    render(<DayRow year={2026} month={8} day={17} entry={undefined} typ="A" feiertag={null} onClick={onClick} />);
    fireEvent.click(screen.getByText('17'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('rendert die Wochenend-Klasse bei Typ W', () => {
    const { container } = render(
      <DayRow year={2026} month={8} day={15} entry={undefined} typ="W" feiertag={null} onClick={() => {}} />,
    );
    expect(container.querySelector('.day-row.weekend')).toBeInTheDocument();
  });

  it('markiert den heutigen Tag (Datum stimmt mit Systemzeit überein)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17)); // 17.09.2026 (Monat 0-indiziert)
    try {
      const { container } = render(
        <DayRow year={2026} month={9} day={17} entry={undefined} typ="A" feiertag={null} onClick={() => {}} />,
      );
      expect(container.querySelector('.day-row.today')).toBeInTheDocument();
      expect(container.querySelector('.num.today')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('markiert einen anderen Tag NICHT als heute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 17));
    try {
      const { container } = render(
        <DayRow year={2026} month={9} day={18} entry={undefined} typ="A" feiertag={null} onClick={() => {}} />,
      );
      expect(container.querySelector('.day-row.today')).not.toBeInTheDocument();
      expect(container.querySelector('.num.today')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
