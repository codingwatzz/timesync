// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImportConfirmDialog } from '../ImportConfirmDialog';
import type { ImportPlan } from '../../lib/importPlan';
import type { TagesEintrag } from '../../core/types';

function makeEntry(overrides: Partial<TagesEintrag> = {}): TagesEintrag {
  return {
    typ: 'A', typManuell: true, ho: false,
    start: '', ende: '', pause: '0', start2: '', ende2: '', pause2: '',
    beschreibung: '', km: '', transport: '', hotel: '', bewirtung: '', sonstiges: '',
    reiseland: 'Deutschland', reiseart: '', fr: false, mi: false, ab: false, receiptIds: [],
    ...overrides,
  };
}

describe('ImportConfirmDialog', () => {
  it('rendert nichts, wenn kein Plan vorliegt', () => {
    const { container } = render(<ImportConfirmDialog plan={null} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('zeigt Überschreib-Warnung + Backup-Button, wenn Tage überschrieben würden', () => {
    const plan: ImportPlan = {
      candidates: [{ key: '2028-12-01', data: makeEntry() }],
      existing: { '2028-12-01': makeEntry({ beschreibung: 'Alt' }) },
      overwriteKeys: ['2028-12-01'], newKeys: [],
      fromKey: '2028-12-01', toKey: '2028-12-01',
    };
    render(<ImportConfirmDialog plan={plan} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText(/dabei überschrieben werden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sicherheitskopie herunterladen/ })).toBeInTheDocument();
  });

  it('zeigt KEINE Überschreib-Warnung/Backup-Button, wenn alle Tage neu sind', () => {
    const plan: ImportPlan = {
      candidates: [{ key: '2028-12-01', data: makeEntry() }],
      existing: {}, overwriteKeys: [], newKeys: ['2028-12-01'],
      fromKey: '2028-12-01', toKey: '2028-12-01',
    };
    render(<ImportConfirmDialog plan={plan} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Sicherheitskopie/ })).not.toBeInTheDocument();
    expect(screen.getByText(/nichts geht dabei verloren/)).toBeInTheDocument();
  });

  it('ruft onConfirm/onCancel korrekt auf', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const plan: ImportPlan = {
      candidates: [{ key: '2028-12-01', data: makeEntry() }],
      existing: {}, overwriteKeys: [], newKeys: ['2028-12-01'],
      fromKey: '2028-12-01', toKey: '2028-12-01',
    };
    render(<ImportConfirmDialog plan={plan} onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt importieren' }));
    expect(onConfirm).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
