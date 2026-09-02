import { useEffect, useRef, useState } from 'react';
import { WOCHENTAGE, TYP_LABEL, REISEARTEN, LAENDER } from '../core/constants';
import { pad } from '../core/formatters';
import { feiertagName } from '../core/holidays';
import { useStore } from '../hooks/useStore';
import { loadReceipt, saveReceipt, deleteReceipt as deleteReceiptFromStore } from '../hooks/entryStorage';
import { fileToDataURL, photoToPdf } from '../lib/pdf';
import { markPendingReceiptLink, clearPendingReceiptLink } from '../lib/pendingReceiptLinks';
import type { TagesEintrag, Wochentyp, BelegMeta } from '../core/types';

interface DetailSheetProps {
  dateKey: string; // YYYY-MM-DD
  entry: TagesEintrag;
  onSave: (key: string, entry: TagesEintrag) => Promise<void>;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export function DetailSheet({ dateKey, entry: initialEntry, onSave, onClose, showToast }: DetailSheetProps) {
  const { store } = useStore();
  const [entry, setEntry] = useState<TagesEintrag>(initialEntry);
  const [receipts, setReceipts] = useState<BelegMeta[]>([]);
  const [zweiteSchichtOffen, setZweiteSchichtOffen] = useState(
    Boolean(initialEntry.start2 || initialEntry.ende2 || initialEntry.pause2),
  );
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Auto-Save: Änderungen werden ~1s nach der letzten Eingabe automatisch gespeichert, kein
  // Klick auf "Speichern" mehr nötig (vorher gingen Formularfeld-Änderungen verloren, wenn
  // man das Sheet ohne diesen Klick schloss - Belege selbst waren davon nie betroffen, die
  // werden schon seit dem 01.09.-Fix sofort beim Hochladen gespeichert). `entryRef`/`savedRef`
  // umgehen das React-Closure-Problem in der debounce-Funktion; `hasUnsavedRef` steuert das
  // finale Flush-Save beim Schließen.
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const savedRef = useRef(initialEntry);
  const hasUnsavedRef = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function flushSave() {
    if (debounceTimer.current) { clearTimeout(debounceTimer.current); debounceTimer.current = null; }
    if (!hasUnsavedRef.current) return;
    const toSave = entryRef.current;
    hasUnsavedRef.current = false;
    savedRef.current = toSave;
    await onSave(dateKey, toSave);
  }

  useEffect(() => {
    // Beim Unmount (Sheet wird geschlossen) sofort final speichern, falls noch etwas
    // Ungesichertes übrig ist - unabhängig vom Debounce-Timer.
    return () => { flushSave(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [y, m, d] = dateKey.split('-').map(Number);
  const dow = WOCHENTAGE[new Date(y, m - 1, d).getDay()];
  const feiertag = feiertagName(y, m, d);
  const showTravel = entry.typ === 'A' && !entry.ho;

  // Beleg-Metadaten laden, sobald sich die Beleg-IDs ändern (z.B. nach Upload/Löschen)
  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    Promise.all(entry.receiptIds.map((id) => loadReceipt(store, id))).then((list) => {
      if (!cancelled) setReceipts(list.filter((r): r is BelegMeta => r !== null));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, entry.receiptIds.join(',')]);

  function update<K extends keyof TagesEintrag>(field: K, value: TagesEintrag[K]) {
    setEntry((prev) => {
      const next = { ...prev, [field]: value };
      hasUnsavedRef.current = true;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => { flushSave(); }, 1000);
      return next;
    });
  }

  function setTyp(typ: Wochentyp) {
    update('typ', typ);
    update('typManuell', true);
  }

  async function handleSave() {
    await flushSave();
    showToast('Gespeichert');
    onClose();
  }

  function handleClose() {
    flushSave();
    onClose();
  }

  // Nach einem direkten (nicht-debounced) Save markieren, damit ein evtl. noch laufender
  // Debounce-Timer später keinen überflüssigen, redundanten Save mehr auslöst.
  function markSaved(saved: TagesEintrag) {
    if (debounceTimer.current) { clearTimeout(debounceTimer.current); debounceTimer.current = null; }
    hasUnsavedRef.current = false;
    savedRef.current = saved;
  }

  async function handlePdfUpload(file: File) {
    if (file.size > 4.5 * 1024 * 1024) { showToast('PDF zu groß (max ~4,5 MB)'); return; }
    if (!store) return;
    const dataUrl = await fileToDataURL(file);
    const rid = 'r' + Date.now() + Math.random().toString(36).slice(2, 7);
    const meta: BelegMeta = { id: rid, name: file.name, mime: 'application/pdf', dataUrl, createdAt: Date.now(), date: dateKey };
    // Absicht VOR den beiden Appwrite-Schreibvorgängen synchron vermerken - falls die Seite
    // dazwischen unterbrochen wird, kann die Verknüpfung beim nächsten App-Start nachgeholt
    // werden (siehe pendingReceiptLinks.ts).
    markPendingReceiptLink(dateKey, rid);
    await saveReceipt(store, rid, meta);
    const nextEntry = { ...entry, receiptIds: [...entry.receiptIds, rid] };
    setEntry(nextEntry);
    await onSave(dateKey, nextEntry);
    markSaved(nextEntry);
    clearPendingReceiptLink(dateKey, rid);
    showToast('Beleg gespeichert');
  }

  async function handlePhotoUpload(file: File) {
    if (!store) return;
    showToast('Wird verarbeitet…');
    try {
      const pdfDataUrl = await photoToPdf(file);
      const rid = 'r' + Date.now() + Math.random().toString(36).slice(2, 7);
      const name = `Foto-${new Date().toISOString().slice(0, 10)}.pdf`;
      const meta: BelegMeta = { id: rid, name, mime: 'application/pdf', dataUrl: pdfDataUrl, createdAt: Date.now(), date: dateKey };
      // Absicht VOR den beiden Appwrite-Schreibvorgängen synchron vermerken - genau dieser
      // Pfad (native Kamera-App via capture="environment") kann die Seite dazwischen
      // pausieren/neu laden. Siehe pendingReceiptLinks.ts.
      markPendingReceiptLink(dateKey, rid);
      await saveReceipt(store, rid, meta);
      const nextEntry = { ...entry, receiptIds: [...entry.receiptIds, rid] };
      setEntry(nextEntry);
      await onSave(dateKey, nextEntry);
      markSaved(nextEntry);
      clearPendingReceiptLink(dateKey, rid);
      showToast('Beleg gespeichert');
    } catch {
      showToast('Fehler bei PDF-Erstellung');
    }
  }

  async function handleDeleteReceipt(rid: string) {
    if (!store) return;
    await deleteReceiptFromStore(store, rid);
    const nextEntry = { ...entry, receiptIds: entry.receiptIds.filter((id) => id !== rid) };
    setEntry(nextEntry);
    await onSave(dateKey, nextEntry);
    markSaved(nextEntry);
  }

  function toggleYesNo(field: 'fr' | 'mi' | 'ab') {
    update(field, !entry[field]);
  }

  return (
    <div className="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="sheet">
        <div className="sheet-handle" />
        <h2>{dow}, {pad(d)}.{pad(m)}.{y}</h2>
        <div className="sheet-sub">Tageseintrag bearbeiten{feiertag ? ' · ' + feiertag : ''}</div>

        <div className="section-title">Tagestyp</div>
        <div className="typ-pick" id="typPick">
          {(Object.keys(TYP_LABEL) as Wochentyp[]).map((t) => (
            <button
              key={t}
              data-t={t}
              className={t === entry.typ ? `active ${t}` : ''}
              onClick={() => setTyp(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="toggle-row" style={{ marginTop: 14 }}>
          <div className="tl">Homeoffice</div>
          <div
            id="hoSwitch"
            className={`switch${entry.ho ? ' on' : ''}`}
            onClick={() => update('ho', !entry.ho)}
          >
            <div className="knob" />
          </div>
        </div>

        <div className="section-title">Zeiten</div>
        <div className="row3">
          <div className="field"><label>Start</label>
            <input id="f_start" type="time" value={entry.start} onChange={(e) => update('start', e.target.value)} />
          </div>
          <div className="field"><label>Ende</label>
            <input id="f_ende" type="time" value={entry.ende} onChange={(e) => update('ende', e.target.value)} />
          </div>
          <div className="field"><label>Pause (Min)</label>
            <input id="f_pause" type="number" placeholder="0" value={entry.pause} onChange={(e) => update('pause', e.target.value)} />
          </div>
        </div>

        {zweiteSchichtOffen ? (
          <>
            <div className="row3" style={{ marginTop: -6 }}>
              <div className="field"><label>Start (2. Schicht)</label>
                <input id="f_start2" type="time" value={entry.start2} onChange={(e) => update('start2', e.target.value)} />
              </div>
              <div className="field"><label>Ende (2. Schicht)</label>
                <input id="f_ende2" type="time" value={entry.ende2} onChange={(e) => update('ende2', e.target.value)} />
              </div>
              <div className="field"><label>Pause (Min)</label>
                <input id="f_pause2" type="number" placeholder="0" value={entry.pause2} onChange={(e) => update('pause2', e.target.value)} />
              </div>
            </div>
            <button
              id="removeSecondShiftBtn"
              className="close"
              style={{ width: '100%', marginBottom: 14, padding: '8px' }}
              onClick={() => {
                update('start2', ''); update('ende2', ''); update('pause2', '');
                setZweiteSchichtOffen(false);
              }}
            >
              × Zweite Schicht entfernen
            </button>
          </>
        ) : (
          <button
            id="addSecondShiftBtn"
            className="close"
            style={{ width: '100%', marginBottom: 14, padding: '8px' }}
            onClick={() => setZweiteSchichtOffen(true)}
          >
            + Zweite Schicht (z. B. abends nochmal gearbeitet)
          </button>
        )}

        <div className="field">
          <label>Notiz / Beschreibung</label>
          <textarea
            id="f_beschreibung"
            placeholder="Anlass, Details, Ort..."
            value={entry.beschreibung}
            onChange={(e) => update('beschreibung', e.target.value)}
          />
        </div>

        <div className="field">
          <label>Sonstiges € <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(z.B. Bahncard, Deutschlandticket - unabhängig vom Tagestyp)</span></label>
          <input id="f_sonstiges" type="number" placeholder="0,00" value={entry.sonstiges} onChange={(e) => update('sonstiges', e.target.value)} />
        </div>

        <div id="travelSection" style={{ display: showTravel ? '' : 'none' }}>
          <div className="section-title">Fahrt &amp; Kosten</div>
          <div className="row2">
            <div className="field"><label>Gefahrene km</label>
              <input id="f_km" type="number" placeholder="0" value={entry.km} onChange={(e) => update('km', e.target.value)} />
            </div>
            <div className="field"><label>Transport €</label>
              <input id="f_transport" type="number" placeholder="0,00" value={entry.transport} onChange={(e) => update('transport', e.target.value)} />
            </div>
          </div>
          <div className="row2">
            <div className="field"><label>Hotel €</label>
              <input id="f_hotel" type="number" placeholder="0,00" value={entry.hotel} onChange={(e) => update('hotel', e.target.value)} />
            </div>
            <div className="field">
              <label>Bewirtung € <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(+Beleg)</span></label>
              <input id="f_bewirtung" type="number" placeholder="0,00" value={entry.bewirtung} onChange={(e) => update('bewirtung', e.target.value)} />
            </div>
          </div>

          <div className="section-title">Verpflegungsmehraufwand</div>
          {!entry.reiseart && (
            <div id="reiseartWarn" className="warn-banner">
              ⚠ Ohne Art des Reisetages wird in der Spesenabrechnung kein Verpflegungsmehraufwand berechnet.
            </div>
          )}
          <div className="row2">
            <div className="field">
              <label>Reiseland</label>
              <select id="f_reiseland" value={entry.reiseland} onChange={(e) => update('reiseland', e.target.value as TagesEintrag['reiseland'])}>
                {LAENDER.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Art des Reisetages</label>
              <select id="f_reiseart" value={entry.reiseart} onChange={(e) => update('reiseart', e.target.value as TagesEintrag['reiseart'])}>
                {REISEARTEN.map((a) => <option key={a} value={a}>{a || '– keine –'}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Mahlzeit durch Firma bezahlt?</label>
            <div className="row3">
              <div className="yesno" data-field="fr">
                <button className={entry.fr ? 'active' : ''} onClick={() => toggleYesNo('fr')}>Frühstück</button>
              </div>
              <div className="yesno" data-field="mi">
                <button className={entry.mi ? 'active' : ''} onClick={() => toggleYesNo('mi')}>Mittag</button>
              </div>
              <div className="yesno" data-field="ab">
                <button className={entry.ab ? 'active' : ''} onClick={() => toggleYesNo('ab')}>Abend</button>
              </div>
            </div>
          </div>
        </div>

        <div className="section-title">Belege</div>
        <div className="receipt-list">
          {receipts.map((r) => (
            <div key={r.id} className="receipt-item" data-rid={r.id}>
              <div className="ic">📄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rn">{r.name}</div>
                <div className="rd">{new Date(r.createdAt).toLocaleDateString('de-DE')}</div>
              </div>
              <button className="del" data-rid={r.id} onClick={() => handleDeleteReceipt(r.id)}>×</button>
            </div>
          ))}
        </div>
        <div className="add-receipt-row">
          <button id="uploadPdfBtn" onClick={() => pdfInputRef.current?.click()}>📎 PDF hochladen</button>
          <button id="takePhotoBtn" onClick={() => photoInputRef.current?.click()}>📷 Foto aufnehmen</button>
        </div>
        <input
          ref={pdfInputRef} id="pdfInput" type="file" accept="application/pdf" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ''; }}
        />
        <input
          ref={photoInputRef} id="photoInput" type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ''; }}
        />

        <div className="sheet-actions">
          <button className="close" id="closeBtn" onClick={handleClose}>Schließen</button>
          <button className="save" id="saveBtn" onClick={handleSave}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
