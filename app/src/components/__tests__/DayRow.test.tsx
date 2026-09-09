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

  it('zeigt das Homeoffice-Flag NICHT an einem Urlaubstag, selbst wenn ho=true gespeichert ist (Regression 07.09.2026: emptyEntry() setzt ho standardmäßig true für JEDEN Tag)', () => {
    const entry = { ...emptyEntry(2026, 8, 17), ho: true, typ: 'U' as const };
    render(<DayRow year={2026} month={8} day={17} entry={entry} typ="U" feiertag={null} onClick={() => {}} />);
    expect(screen.queryByText('Homeoffice')).not.toBeInTheDocument();
  });

  it('zeigt das Homeoffice-Flag NICHT an einem Kranktag', () => {
    const entry = { ...emptyEntry(2026, 8, 17), ho: true, typ: 'K' as const };
    render(<DayRow year={2026} month={8} day={17} entry={entry} typ="K" feiertag={null} onClick={() => {}} />);
    expect(screen.queryByText('Homeoffice')).not.toBeInTheDocument();
  });

  it('zeigt die Reiseart-Warnung bei "vor Ort"-Tag ohne gesetzte Reiseart', () => {
    const entry = { ...emptyEntry(2026, 8, 17), ho: false, typ: 'A' as const, km: '50' };
    render(<DayRow year={2026} month={8} day={17} entry={entry} typ="A" feiertag={null} onClick={() => {}} />);
    expect(screen.getByText('Reiseart fehlt')).toBeInTheDocument();
  });

  it('zeigt KEINE Reiseart-Warnung, wenn eine Reiseart gesetzt ist', () => {
    const entry = { ...emptyEntry(2026, 8, 17), ho: false, typ: 'A' as const, km: '50', reiseart: 'Anreisetag' as const };
    render(<DayRow year={2026} month={8} day={17} entry={entry} typ="A" feiertag={null} onClick={() => {}} />);
    expect(screen.queryByText('Reiseart fehlt')).not.toBeInTheDocument();
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

  it('stellt Nicht-Arbeitstage kompakt dar, wie Wochenenden (Nutzerwunsch 07.09.2026)', () => {
    const kleineSchrift = (typ: 'U' | 'K' | 'G' | 'F') => {
      const { container } = render(
        <DayRow year={2026} month={8} day={15} entry={undefined} typ={typ} feiertag={typ === 'F' ? 'Test-Feiertag' : null} onClick={() => {}} />,
      );
      // Kompakte Darstellung erkennbar an der kleineren Datums-Schriftgröße (13px statt 17px) -
      // dieselbe Klasse, die Wochenendzeilen schon verwenden.
      expect(container.querySelector('.num.text-\\[13px\\]')).toBeInTheDocument();
    };
    kleineSchrift('U');
    kleineSchrift('K');
    kleineSchrift('G');
    kleineSchrift('F');
  });

  it('stellt einen echten Arbeitstag NICHT kompakt dar', () => {
    const { container } = render(
      <DayRow year={2026} month={8} day={17} entry={undefined} typ="A" feiertag={null} onClick={() => {}} />,
    );
    expect(container.querySelector('.num.text-\\[17px\\]')).toBeInTheDocument();
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

  it('zeigt ein km-Flag, wenn gefahrene Kilometer eingetragen sind', () => {
    const entry = { ...emptyEntry(2026, 9, 17), typ: 'A' as const, ho: false, km: '85' };
    render(
      <DayRow year={2026} month={9} day={17} entry={entry} typ="A" feiertag={null} onClick={() => {}} />,
    );
    expect(screen.getByText('85 km')).toBeInTheDocument();
  });

  it('zeigt KEIN km-Flag, wenn keine Kilometer eingetragen sind', () => {
    const entry = { ...emptyEntry(2026, 9, 17), typ: 'A' as const, ho: false };
    const { container } = render(
      <DayRow year={2026} month={9} day={17} entry={entry} typ="A" feiertag={null} onClick={() => {}} />,
    );
    expect(container.querySelector('.flag.km')).not.toBeInTheDocument();
  });

  it('zeigt die Warnung "Keine Arbeitszeit erfasst" an einem vergangenen Arbeitstag ohne Eintrag', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4)); // "heute" = 04.09.2026
    try {
      render(
        <DayRow year={2026} month={9} day={3} entry={undefined} typ="A" feiertag={null} onClick={() => {}} />,
      );
      expect(screen.getByText('Keine Arbeitszeit erfasst')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('zeigt die Warnung NICHT am heutigen Tag, auch ohne erfasste Arbeitszeit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4));
    try {
      render(
        <DayRow year={2026} month={9} day={4} entry={undefined} typ="A" feiertag={null} onClick={() => {}} />,
      );
      expect(screen.queryByText('Keine Arbeitszeit erfasst')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('zeigt die Warnung NICHT, sobald eine Arbeitszeit erfasst wurde', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4));
    try {
      const entry = { ...emptyEntry(2026, 9, 3), start: '08:00', ende: '16:00' };
      render(
        <DayRow year={2026} month={9} day={3} entry={entry} typ="A" feiertag={null} onClick={() => {}} />,
      );
      expect(screen.queryByText('Keine Arbeitszeit erfasst')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('zeigt die Warnung NICHT an einem vergangenen Wochenendtag ohne Eintrag', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4));
    try {
      render(
        <DayRow year={2026} month={8} day={30} entry={undefined} typ="W" feiertag={null} onClick={() => {}} />,
      );
      expect(screen.queryByText('Keine Arbeitszeit erfasst')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('zeigt das "extern"-Flag (vormals "Vor Ort") an einem echten Vor-Ort-Arbeitstag', () => {
    const entry = { ...emptyEntry(2026, 9, 17), typ: 'A' as const, ho: false, km: '50' };
    render(
      <DayRow year={2026} month={9} day={17} entry={entry} typ="A" feiertag={null} onClick={() => {}} />,
    );
    expect(screen.getByText('extern')).toBeInTheDocument();
    expect(screen.queryByText('Vor Ort')).not.toBeInTheDocument();
  });

  it('zeigt die geleistete Arbeitszeit als HH:MM, wenn Start/Ende erfasst sind', () => {
    const entry = { ...emptyEntry(2026, 9, 17), start: '08:00', ende: '16:30', pause: '30' };
    render(<DayRow year={2026} month={9} day={17} entry={entry} typ="A" feiertag={null} onClick={() => {}} />);
    expect(screen.getByText('08:00')).toBeInTheDocument();
  });

  it('zeigt KEINE Arbeitszeit, wenn keine Start/Ende-Zeiten erfasst sind', () => {
    const entry = emptyEntry(2026, 9, 17);
    const { container } = render(
      <DayRow year={2026} month={9} day={17} entry={entry} typ="A" feiertag={null} onClick={() => {}} />,
    );
    expect(container.querySelector('.stunden')).not.toBeInTheDocument();
  });

  it('zeigt Arbeitszeit UND Kostenbetrag gemeinsam, wenn beides erfasst ist', () => {
    const entry = { ...emptyEntry(2026, 9, 17), start: '08:00', ende: '16:00', transport: '20' };
    const { container } = render(
      <DayRow year={2026} month={9} day={17} entry={entry} typ="A" feiertag={null} onClick={() => {}} />,
    );
    expect(container.querySelector('.stunden')).toHaveTextContent('08:00');
    expect(container.querySelector('.sum')).toHaveTextContent('20,00');
  });

  it('zeigt das "Beleg fehlt"-Flag, wenn belegFehlt=true übergeben wird', () => {
    const entry = { ...emptyEntry(2026, 10, 5), hotel: '270' };
    render(
      <DayRow year={2026} month={10} day={5} entry={entry} typ="A" feiertag={null} onClick={() => {}} belegFehlt />,
    );
    expect(screen.getByText('Beleg fehlt')).toBeInTheDocument();
  });

  it('zeigt das "Beleg fehlt"-Flag NICHT ohne das Prop (Default false, ältere Aufrufer bleiben unverändert)', () => {
    const entry = { ...emptyEntry(2026, 10, 5), hotel: '270' };
    render(
      <DayRow year={2026} month={10} day={5} entry={entry} typ="A" feiertag={null} onClick={() => {}} />,
    );
    expect(screen.queryByText('Beleg fehlt')).not.toBeInTheDocument();
  });
});
