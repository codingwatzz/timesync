import { useEffect, useRef, useState } from 'react';
import { WOCHENTAGE, TYP_LABEL, REISEARTEN, LAENDER } from '../core/constants';
import { pad, pauseOptionsFor, fmtHHMM, toNumber, sanitizeAmountInput } from '../core/formatters';
import { arbeitszeitMinuten } from '../core/entry';
import { feiertagName } from '../core/holidays';
import { useStore } from '../hooks/useStore';
import { loadReceipt, saveReceipt, deleteReceipt as deleteReceiptFromStore } from '../hooks/entryStorage';
import { fileToDataURL, photoToPdf } from '../lib/pdf';
import { markPendingReceiptLink, clearPendingReceiptLink } from '../lib/pendingReceiptLinks';
import { useSwipe } from '../hooks/useSwipe';
import { useSwipeDown } from '../hooks/useSwipeDown';
import { Paperclip, Camera, FileText, X, Plus, AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import type { TagesEintrag, Wochentyp, BelegMeta, BelegFeld } from '../core/types';

// Kurzform-Labels nur für die Dropdown-ANZEIGE (Werte selbst bleiben unverändert, siehe
// core/constants.ts::REISEARTEN - die Exportlogik matcht auf die vollen Werte). Grund:
// "Abwesenheitstag (>8h)" vs. "(24h)" unterscheiden sich erst am Ende und wurden im
// schmalen Select abgeschnitten (nicht mehr unterscheidbar, siehe UX-Audit 05.09.2026).
const REISEART_LABEL: Record<string, string> = {
  '': '– keine –',
  Anreisetag: 'Anreisetag',
  Abreisetag: 'Abreisetag',
  'Abwesenheitstag (<8h)': 'Abwesend (<8h)',
  'Abwesenheitstag (>8h)': 'Abwesend (>8h)',
  'Abwesenheitstag (24h)': 'Abwesend (24h)',
};

const BELEG_FELD_LABEL: Record<BelegFeld, string> = {
  '': '– kein Feld –',
  transport: 'Transport',
  hotel: 'Hotel',
  bewirtung: 'Bewirtung',
  sonstiges: 'Sonstiges',
};

/** Kostenfelder, die einem Beleg zuordenbar sind (Sonstiges bewusst mit dabei, obwohl es
 * außerhalb des "Fahrt & Kosten"-Blocks steht - siehe UX-Audit-Folgeauftrag 06.09.2026). */
const BELEG_ZUORDENBARE_FELDER = ['transport', 'hotel', 'bewirtung', 'sonstiges'] as const;

/** Prüft, ob für einen Tag bereits Daten vorliegen, die bei "kein Arbeitstag" normalerweise
 * ausgeblendet würden (Zeiten/Fahrt&Kosten/Verpflegung/Belege - NICHT Sonstiges oder
 * Beschreibung, die bleiben ohnehin immer sichtbar). "ho" bewusst NICHT geprüft - ist laut
 * core/entry.ts::emptyEntry() für JEDEN Tag standardmäßig true, kein echtes Nutzer-Signal.
 * Wird für zwei Zwecke genutzt:
 * 1) Sheet startet beim Öffnen bereits "freigeschaltet", wenn solche Daten schon existieren
 *    (damit nichts Bestehendes unerwartet versteckt wird).
 * 2) Bestätigungsdialog beim Wechsel weg von "Arbeit" nur zeigen, wenn wirklich etwas zu
 *    verlieren/übersehen wäre. */
function hatVersteckbareDaten(e: TagesEintrag): boolean {
  return Boolean(
    e.start || e.ende || e.start2 || e.ende2 || e.km || e.transport || e.hotel
    || e.bewirtung || e.reiseart || e.fr || e.mi || e.ab || e.receiptIds.length > 0,
  );
}

// ---------------------------------------------------------------------
// Styling-Konstanten (Tailwind, Design-System "Slate & Teal", dark-first).
// Reine Präsentationsschicht - keine Logik. Zentral gehalten, damit sich
// wiederholende Formularfelder nicht 15x dieselbe Klassenkette tragen.
// ---------------------------------------------------------------------
const labelCls = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-muted';
const inputCls =
  'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] text-text ' +
  'placeholder:text-text-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const sectionTitleCls =
  'mt-4 mb-2 border-t border-border pt-3 text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted';
const secondaryBtnCls =
  'mb-3.5 min-h-11 w-full rounded-lg border border-border bg-surface px-2 py-2.5 text-sm font-semibold ' +
  'text-text-muted transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none';

const TAB_BG: Record<Wochentyp, string> = {
  A: 'bg-tab-a', W: 'bg-tab-w', F: 'bg-tab-f', U: 'bg-tab-u', K: 'bg-tab-k', G: 'bg-tab-g',
};

interface DetailSheetProps {
  dateKey: string; // YYYY-MM-DD
  entry: TagesEintrag;
  onSave: (key: string, entry: TagesEintrag) => Promise<void>;
  onClose: () => void;
  showToast: (msg: string) => void;
  // Optional: wird aufgerufen, um zum vorigen (-1) oder nächsten (+1) Tag zu wechseln
  // (Wisch-Geste). Das Sheet bleibt dabei offen, nur dateKey/entry wechseln (siehe App.tsx -
  // erzwingt per key={dateKey} einen Remount, der automatisch flushSave() für den alten Tag
  // auslöst, bevor der neue Tag frisch gerendert wird).
  onNavigateDay?: (delta: 1 | -1) => void;
}

export function DetailSheet({ dateKey, entry: initialEntry, onSave, onClose, showToast, onNavigateDay }: DetailSheetProps) {
  const { store } = useStore();
  const [entry, setEntry] = useState<TagesEintrag>(initialEntry);
  const [receipts, setReceipts] = useState<BelegMeta[]>([]);
  const [zweiteSchichtOffen, setZweiteSchichtOffen] = useState(
    Boolean(initialEntry.start2 || initialEntry.ende2 || initialEntry.pause2),
  );
  const [legendeOffen, setLegendeOffen] = useState(false);
  // Bei Nicht-Arbeitstagen (W/F/U/K/G) sind Zeiten/Homeoffice/Fahrt&Kosten/Verpflegung/Belege
  // per default ausgeblendet (siehe hatVersteckbareDaten-Kommentar oben) - startet aber schon
  // "freigeschaltet", falls für diesen Tag bereits solche Daten vorliegen (nichts Bestehendes
  // unerwartet verstecken).
  const [freigeschaltet, setFreigeschaltet] = useState(() => hatVersteckbareDaten(initialEntry));
  // Bestätigungsdialog beim Wechsel von "Arbeit" auf einen anderen Tagestyp, wenn schon Daten
  // vorliegen - hält den ZIEL-Tagestyp, bis der Nutzer bestätigt oder abbricht.
  const [pendingTypWechsel, setPendingTypWechsel] = useState<Wochentyp | null>(null);
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

  async function flushSave(opts: { silent?: boolean } = {}) {
    if (debounceTimer.current) { clearTimeout(debounceTimer.current); debounceTimer.current = null; }
    if (!hasUnsavedRef.current) return;
    const toSave = entryRef.current;
    hasUnsavedRef.current = false;
    savedRef.current = toSave;
    await onSave(dateKey, toSave);
    // Rückmeldung bei jedem ECHTEN Speichern (Auto-Save nach Tippen ODER expliziter Klick) -
    // vorher speicherte Auto-Save komplett unsichtbar im Hintergrund, was laut UI-Review
    // (02.09.2026) Unsicherheit erzeugen kann ("hat sich das jetzt wirklich gespeichert?").
    // Beim stillen Schließen/Unmount (silent:true) KEIN Toast - der wäre ohnehin kaum noch
    // sichtbar und beim Wegnavigieren nicht hilfreich.
    if (!opts.silent) showToast('Gespeichert');
  }

  useEffect(() => {
    // Beim Unmount (Sheet wird geschlossen) sofort final speichern, falls noch etwas
    // Ungesichertes übrig ist - unabhängig vom Debounce-Timer.
    return () => { flushSave({ silent: true }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [y, m, d] = dateKey.split('-').map(Number);
  const dow = WOCHENTAGE[new Date(y, m - 1, d).getDay()];
  const feiertag = feiertagName(y, m, d);
  const showTravel = (entry.typ === 'A' || freigeschaltet) && !entry.ho;
  const zeigeVersteckteFelder = entry.typ === 'A' || freigeschaltet;

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

  /** Wie setTyp(), aber fragt erst nach, wenn von "Arbeit" auf einen anderen Tagestyp
   * gewechselt wird UND für den Tag schon Zeiten/Kosten/Belege vorliegen - siehe
   * hatVersteckbareDaten(). Bestätigt der Nutzer, bleiben die Felder automatisch sichtbar
   * (freigeschaltet), statt dass er direkt danach nochmal extra entsperren müsste. */
  function requestTypChange(t: Wochentyp) {
    if (entry.typ === 'A' && t !== 'A' && hatVersteckbareDaten(entry)) {
      setPendingTypWechsel(t);
      return;
    }
    setTyp(t);
  }

  function confirmTypWechsel() {
    if (pendingTypWechsel) {
      setTyp(pendingTypWechsel);
      setFreigeschaltet(true);
    }
    setPendingTypWechsel(null);
  }

  async function handleSave() {
    await flushSave();
    onClose();
  }

  function handleClose() {
    flushSave({ silent: true });
    onClose();
  }

  // Wischen nach links = nächster Tag, nach rechts = voriger Tag - dasselbe Muster wie beim
  // Monatswechsel. Nur aktiv, wenn onNavigateDay übergeben wurde.
  const swipeHandlers = useSwipe(
    () => onNavigateDay?.(1),
    () => onNavigateDay?.(-1),
  );
  // Wischen nach UNTEN am Sheet-Griff schließt das Sheet (Bottom-Sheet-Standardmuster) -
  // bewusst NUR auf den Griff-Bereich angewendet, nicht auf das ganze Sheet, damit normales
  // Scrollen im Formular nicht versehentlich als Schließen-Geste interpretiert wird.
  const swipeDownHandlers = useSwipeDown(handleClose);

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

  async function handleOpenReceipt(r: BelegMeta) {
    if (!r.dataUrl) { showToast('Beleg konnte nicht geladen werden'); return; }
    try {
      // Blob-URL statt roher data:-URL an window.open übergeben - robuster bei größeren PDFs
      // (manche Browser haben Längenbeschränkungen/Eigenheiten bei sehr langen data:-URLs in
      // window.open). Öffnet im nativen, rein lesenden Browser-PDF-Viewer - kein Bearbeiten
      // möglich.
      const resp = await fetch(r.dataUrl);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank');
      // Object-URL erst nach kurzer Verzögerung freigeben, damit der neue Tab noch Zeit hat,
      // sie zu laden (revokeObjectURL sofort danach könnte den Ladevorgang abbrechen).
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } catch {
      showToast('Beleg konnte nicht geöffnet werden');
    }
  }

  function toggleYesNo(field: 'fr' | 'mi' | 'ab') {
    update(field, !entry[field]);
  }

  // Für welche Kostenfelder ist ein Betrag > 0 eingetragen, aber KEIN Beleg mit passender
  // Zuordnung vorhanden? Rein informativ (siehe BelegMeta.feld-Kommentar), beeinflusst den
  // Export nicht.
  const belegFehltFuer = BELEG_ZUORDENBARE_FELDER.filter((feldName) => {
    const val = toNumber(entry[feldName]);
    if (!val || val <= 0) return false;
    return !receipts.some((r) => r.feld === feldName);
  });

  /** Ordnet einen Beleg nachträglich einem Kostenfeld zu (oder entfernt die Zuordnung, '').
   * Kann sowohl direkt nach dem Hochladen als auch später jederzeit genutzt werden - dieselbe
   * Auswahl an jedem Beleg in der Liste. */
  async function handleSetReceiptFeld(rid: string, feld: BelegFeld) {
    if (!store) return;
    const current = receipts.find((r) => r.id === rid);
    if (!current) return;
    const updated = { ...current, feld };
    setReceipts((prev) => prev.map((r) => (r.id === rid ? updated : r)));
    await saveReceipt(store, rid, updated);
  }

  return (
    <div
      className="sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {pendingTypWechsel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-5" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-[360px] rounded-2xl bg-surface-2 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
            <div className="mb-3 flex items-center gap-2 text-warning">
              <ShieldAlert size={20} strokeWidth={2.25} />
              <span className="text-[15px] font-bold text-text">Tagestyp wirklich ändern?</span>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-text-muted">
              Es liegen bereits Einträge/Belege für diesen Tag vor. Soll der Tagestyp wirklich
              von Arbeitstag auf „{TYP_LABEL[pendingTypWechsel]}" geändert werden?
            </p>
            <div className="flex gap-2.5">
              <button
                className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-bold text-text transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                onClick={() => setPendingTypWechsel(null)}
              >
                Abbrechen
              </button>
              <button
                className="min-h-11 flex-1 rounded-lg bg-warning px-3 py-2.5 text-sm font-bold text-canvas transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-text focus-visible:outline-none"
                onClick={confirmTypWechsel}
              >
                Ja, ändern
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        className="sheet mx-auto max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl
          bg-surface-2 px-5 pb-8 pt-1.5 text-text shadow-[0_-12px_40px_-8px_rgba(99,102,241,0.18)]
          animate-[slideup_0.22s_ease] font-sans"
        {...swipeHandlers}
      >
        <div className="sheet-handle-zone flex touch-none justify-center pb-3.5 pt-2.5" {...swipeDownHandlers}>
          <div className="sheet-handle h-1 w-9 rounded-full bg-border" />
        </div>
        <h2 className="m-0 text-[17px] font-semibold text-text">{dow}, {pad(d)}.{pad(m)}.{y}</h2>
        <div className="mb-4 text-xs text-text-muted">Tageseintrag bearbeiten{feiertag ? ' · ' + feiertag : ''}</div>

        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">Tagestyp</span>
          <button
            type="button"
            id="typLegendBtn"
            aria-label="Legende zu den Tagestyp-Kürzeln anzeigen"
            aria-expanded={legendeOffen}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-text-faint transition-colors hover:bg-surface hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            onClick={() => setLegendeOffen((o) => !o)}
          >
            <Info size={14} strokeWidth={2.25} />
          </button>
        </div>
        {legendeOffen && (
          <div className="mb-2.5 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs text-text-muted">
            {(Object.keys(TYP_LABEL) as Wochentyp[]).map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <span className={`inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold ${TAB_BG[t]} ${t === 'F' ? 'text-canvas' : 'text-text-on-accent'}`}>{t}</span>
                {TYP_LABEL[t]}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5" id="typPick">
          {(Object.keys(TYP_LABEL) as Wochentyp[]).map((t) => {
            const active = t === entry.typ;
            return (
              <button
                key={t}
                data-t={t}
                onClick={() => requestTypChange(t)}
                className={
                  active
                    ? `active ${t} flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-transparent px-3 text-sm font-bold ${TAB_BG[t]} ${t === 'F' ? 'text-canvas' : 'text-text-on-accent'}`
                    : 'flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm font-bold text-text-muted transition-colors hover:border-primary hover:text-text focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none'
                }
              >
                {t}
              </button>
            );
          })}
        </div>

        {entry.typ !== 'A' && !freigeschaltet && (
          <div className="mt-3.5 rounded-lg border border-border bg-surface px-3 py-3">
            <div className="mb-2 text-sm text-text-muted">
              Für „{TYP_LABEL[entry.typ]}" sind normalerweise keine Zeiten, Fahrt- oder
              Verpflegungsangaben nötig.
            </div>
            <button
              className="min-h-11 w-full rounded-lg border border-dashed border-border bg-transparent px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              onClick={() => setFreigeschaltet(true)}
            >
              Felder trotzdem bearbeiten
            </button>
          </div>
        )}
        {entry.typ !== 'A' && freigeschaltet && (
          <div className="mt-3.5 flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs font-semibold text-warning">
            <ShieldAlert size={15} className="flex-shrink-0" strokeWidth={2.25} />
            ACHTUNG! Dies ist kein regulärer Arbeitstag.
          </div>
        )}

        {zeigeVersteckteFelder && (
          <>
            <div
              className="mt-3.5 flex min-h-11 cursor-pointer items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              role="switch"
              aria-checked={entry.ho}
              aria-label="Homeoffice"
              tabIndex={0}
              onClick={() => update('ho', !entry.ho)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); update('ho', !entry.ho); } }}
            >
              <div className="text-sm font-semibold text-text">Homeoffice</div>
              <div
                id="hoSwitch"
                className={`relative h-[26px] w-[46px] flex-shrink-0 rounded-full border border-border transition-colors ${entry.ho ? 'on bg-primary' : 'bg-text-faint/35'}`}
              >
                <div className={`absolute top-0.5 h-[22px] w-[22px] rounded-full border border-border bg-text-on-accent shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-[left] duration-150 ${entry.ho ? 'left-[22px]' : 'left-0.5'}`} />
              </div>
            </div>

            <div className={`${sectionTitleCls} flex items-center justify-between`}>
              <span>Zeiten</span>
              <span className="arbeitszeit-badge rounded-full bg-primary-soft px-2.5 py-0.5 font-mono text-[13px] font-bold text-primary">
                {fmtHHMM(arbeitszeitMinuten(entry))}
              </span>
            </div>
            <div className="flex gap-2">
              <div className="flex-1"><label className={labelCls}>Start</label>
                <input className={inputCls} id="f_start" type="time" lang="de-DE" value={entry.start} onChange={(e) => update('start', e.target.value)} />
              </div>
              <div className="flex-1"><label className={labelCls}>Ende</label>
                <input className={inputCls} id="f_ende" type="time" lang="de-DE" value={entry.ende} onChange={(e) => update('ende', e.target.value)} />
              </div>
              <div className="flex-1"><label className={labelCls}>Pause (Min)</label>
                <select className={inputCls} id="f_pause" value={entry.pause || '0'} onChange={(e) => update('pause', e.target.value)}>
                  {pauseOptionsFor(entry.pause).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {zweiteSchichtOffen ? (
              <>
                <div className="mb-2 mt-3.5 border-t border-dashed border-border pt-2.5 text-[10px] font-bold uppercase tracking-wide text-primary">2. Schicht</div>
                <div className="flex gap-2">
                  <div className="flex-1"><label className={labelCls}>Start</label>
                    <input className={inputCls} id="f_start2" type="time" lang="de-DE" value={entry.start2} onChange={(e) => update('start2', e.target.value)} />
                  </div>
                  <div className="flex-1"><label className={labelCls}>Ende</label>
                    <input className={inputCls} id="f_ende2" type="time" lang="de-DE" value={entry.ende2} onChange={(e) => update('ende2', e.target.value)} />
                  </div>
                  <div className="flex-1"><label className={labelCls}>Pause (Min)</label>
                    <select className={inputCls} id="f_pause2" value={entry.pause2 || '0'} onChange={(e) => update('pause2', e.target.value)}>
                      {pauseOptionsFor(entry.pause2).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <button
                  id="removeSecondShiftBtn"
                  className={`${secondaryBtnCls} flex items-center justify-center gap-1.5`}
                  onClick={() => {
                    update('start2', ''); update('ende2', ''); update('pause2', '');
                    setZweiteSchichtOffen(false);
                  }}
                >
                  <X size={14} strokeWidth={2.25} /> Zweite Schicht entfernen
                </button>
              </>
            ) : (
              <button
                id="addSecondShiftBtn"
                className={`${secondaryBtnCls} mt-3.5 flex items-center justify-center gap-1.5`}
                onClick={() => setZweiteSchichtOffen(true)}
              >
                <Plus size={14} strokeWidth={2.25} /> Zweite Schicht (z. B. abends nochmal gearbeitet)
              </button>
            )}
          </>
        )}

        <div className="mb-3.5">
          <label className={labelCls}>Beschreibung / Notiz</label>
          <textarea
            className={`${inputCls} min-h-[44px] resize-y`}
            id="f_beschreibung"
            placeholder="Anlass, Details, Ort..."
            value={entry.beschreibung}
            onChange={(e) => update('beschreibung', e.target.value)}
          />
        </div>

        {zeigeVersteckteFelder && (
        <div id="travelSection" style={{ display: showTravel ? '' : 'none' }}>
          <div className={sectionTitleCls}>Fahrt &amp; Kosten</div>
          <div className="flex gap-2.5">
            <div className="mb-3.5 flex-1">
              <label className={labelCls}>Gefahrene km <span className="font-normal normal-case tracking-normal text-text-faint">(priv. PKW)</span></label>
              <input className={inputCls} id="f_km" type="text" inputMode="decimal" placeholder="0" value={entry.km} onChange={(e) => update('km', sanitizeAmountInput(e.target.value))} />
            </div>
            <div className="mb-3.5 flex-1">
              <label className={labelCls}>Transport € <span className="font-normal normal-case tracking-normal text-text-faint">(Zug, Flug, ...)</span></label>
              <input className={inputCls} id="f_transport" type="text" inputMode="decimal" placeholder="0,00" value={entry.transport} onChange={(e) => update('transport', sanitizeAmountInput(e.target.value))} />
            </div>
          </div>
          <div className="flex gap-2.5">
            <div className="mb-3.5 flex-1"><label className={labelCls}>Hotel €</label>
              <input className={inputCls} id="f_hotel" type="text" inputMode="decimal" placeholder="0,00" value={entry.hotel} onChange={(e) => update('hotel', sanitizeAmountInput(e.target.value))} />
            </div>
            <div className="mb-3.5 flex-1">
              <label className={labelCls}>Bewirtung €</label>
              <input className={inputCls} id="f_bewirtung" type="text" inputMode="decimal" placeholder="0,00" value={entry.bewirtung} onChange={(e) => update('bewirtung', sanitizeAmountInput(e.target.value))} />
            </div>
          </div>
        </div>
        )}

        <div className="mb-3.5">
          <label className={labelCls}>Sonstiges € <span className="font-normal normal-case tracking-normal text-text-faint">(Parken, Taxi, …)</span></label>
          <input className={inputCls} id="f_sonstiges" type="text" inputMode="decimal" placeholder="0,00" value={entry.sonstiges} onChange={(e) => update('sonstiges', sanitizeAmountInput(e.target.value))} />
        </div>
        <div className="mb-3.5 -mt-2.5 text-[11px] text-text-faint">
          Beträge akzeptieren „,“ oder „.“ als Trennzeichen zwischen Euro und Cent.
        </div>

        {belegFehltFuer.length > 0 && (
          <div className="mb-3.5 flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs font-semibold text-warning">
            <AlertTriangle size={15} className="flex-shrink-0" strokeWidth={2.25} />
            Kein Beleg zugeordnet für: {belegFehltFuer.map((f) => BELEG_FELD_LABEL[f]).join(', ')}
          </div>
        )}

        {zeigeVersteckteFelder && (
        <div style={{ display: showTravel ? '' : 'none' }}>
          <div className={sectionTitleCls}>Verpflegungsmehraufwand</div>
          {!entry.reiseart && (
            <div id="reiseartWarn" className="mb-3.5 flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs font-semibold text-warning">
              <AlertTriangle size={15} className="flex-shrink-0" strokeWidth={2.25} />
              Ohne Art des Reisetages wird in der Spesenabrechnung kein Verpflegungsmehraufwand berechnet.
            </div>
          )}
          <div className="flex gap-2.5">
            <div className="mb-3.5 flex-1">
              <label className={labelCls}>Reiseland</label>
              <select className={inputCls} id="f_reiseland" value={entry.reiseland} onChange={(e) => update('reiseland', e.target.value as TagesEintrag['reiseland'])}>
                {LAENDER.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="mb-3.5 flex-1">
              <label className={labelCls}>Art des Reisetages</label>
              <select className={inputCls} id="f_reiseart" value={entry.reiseart} onChange={(e) => update('reiseart', e.target.value as TagesEintrag['reiseart'])}>
                {REISEARTEN.map((a) => <option key={a} value={a}>{REISEART_LABEL[a]}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-3.5">
            <label className={labelCls}>Mahlzeit durch Firma bezahlt?</label>
            <div className="flex gap-2">
              <div className="yesno flex-1" data-field="fr">
                <button
                  className={`min-h-11 w-full rounded-lg border px-2 py-2 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${entry.fr ? 'active border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-text-muted'}`}
                  onClick={() => toggleYesNo('fr')}
                >Frühstück</button>
              </div>
              <div className="yesno flex-1" data-field="mi">
                <button
                  className={`min-h-11 w-full rounded-lg border px-2 py-2 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${entry.mi ? 'active border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-text-muted'}`}
                  onClick={() => toggleYesNo('mi')}
                >Mittag</button>
              </div>
              <div className="yesno flex-1" data-field="ab">
                <button
                  className={`min-h-11 w-full rounded-lg border px-2 py-2 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${entry.ab ? 'active border-primary bg-primary-soft text-primary' : 'border-border bg-surface text-text-muted'}`}
                  onClick={() => toggleYesNo('ab')}
                >Abend</button>
              </div>
            </div>
          </div>
        </div>
        )}

        {zeigeVersteckteFelder && (
        <>
        <div className={sectionTitleCls}>Belege</div>
        <div className="mb-2.5 flex flex-col gap-2">
          {receipts.map((r) => (
            <div
              key={r.id}
              className="receipt-item flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2.5 transition-colors hover:border-primary active:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              data-rid={r.id}
              onClick={() => handleOpenReceipt(r)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenReceipt(r); } }}
              role="button"
              tabIndex={0}
              title="Zum Ansehen antippen"
            >
              <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                <FileText size={15} strokeWidth={2.25} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-text">{r.name}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <div className="text-[10px] text-text-muted">{new Date(r.createdAt).toLocaleDateString('de-DE')}</div>
                  <select
                    className="rounded border border-border bg-canvas px-1.5 py-1 text-[10px] font-semibold text-text-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                    value={r.feld || ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); handleSetReceiptFeld(r.id, e.target.value as BelegFeld); }}
                  >
                    {(Object.keys(BELEG_FELD_LABEL) as BelegFeld[]).map((f) => (
                      <option key={f} value={f}>{BELEG_FELD_LABEL[f]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                className="del flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center rounded text-danger focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                data-rid={r.id}
                aria-label="Beleg löschen"
                onClick={(e) => { e.stopPropagation(); handleDeleteReceipt(r.id); }}
              >
                <X size={16} strokeWidth={2.25} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            id="uploadPdfBtn"
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-transparent px-3 py-3 text-[13px] font-semibold text-primary transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            onClick={() => pdfInputRef.current?.click()}
          >
            <Paperclip size={15} strokeWidth={2.25} /> PDF hochladen
          </button>
          <button
            id="takePhotoBtn"
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-transparent px-3 py-3 text-[13px] font-semibold text-primary transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            onClick={() => photoInputRef.current?.click()}
          >
            <Camera size={15} strokeWidth={2.25} /> Foto aufnehmen
          </button>
        </div>
        <input
          ref={pdfInputRef} id="pdfInput" type="file" accept="application/pdf" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ''; }}
        />
        <input
          ref={photoInputRef} id="photoInput" type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ''; }}
        />
        </>
        )}

        <div className="sticky bottom-0 mt-5 flex gap-2.5 border-t border-border bg-surface-2 pt-3.5 pb-0.5">
          <button
            className="min-h-11 flex-1 rounded-lg border border-border bg-surface px-3 py-3 text-sm font-bold text-text transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            id="closeBtn"
            onClick={handleClose}
          >Schließen</button>
          <button
            className="min-h-11 flex-1 rounded-lg bg-primary px-3 py-3 text-sm font-bold text-text-on-accent shadow-[0_4px_16px_-2px_rgba(99,102,241,0.4)] transition-colors hover:bg-primary-strong focus-visible:ring-2 focus-visible:ring-text focus-visible:outline-none"
            id="saveBtn"
            onClick={handleSave}
          >Speichern</button>
        </div>
      </div>
    </div>
  );
}
