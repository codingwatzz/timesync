# Projekt: Zeiterfassung & Spesenabrechnung

**Stand: 05.09.2026 – Übergabe nach vollständigem Architektur-Review und Test-Ergänzung.
Alle Fakten direkt am frischen Repo/System verifiziert (npm run verify lokal, letzter E2E
06:13 UTC heute grün). Diese Datei ist die Quelle der Wahrheit – nicht der Chatverlauf.**

## Ziel

Web-App (PWA) zur Erfassung von Arbeitszeiten, Homeoffice-Tagen, Reisekosten und Belegen.

**Live:** https://codingwatzz.github.io/timesync/
**Repo:** https://github.com/codingwatzz/timesync (öffentlich, main-Branch)
**Nutzer:** Raoul Hübner, sqior medical GmbH

## Für Claude: erster Schritt in jeder Sitzung

➡️ **`CLAUDE_CHECKLIST.md`** lesen – verbindliche Arbeitsroutine (lokale Prüfung vor
Live-Zyklen, GitHub-Token-Hinweise, bekannte Fallstricke, Tool-Zeit-Effizienz).

**Falls kein GitHub-Token bekannt ist**: aktiv danach fragen, bevor größere Arbeit beginnt.

## Architektur

React 19 + TypeScript (Vite-Build). Root der `main`-Branch **ist** gleichzeitig der gebaute
Produktions-Output (GitHub Pages serviert von main-Root) – `app/` enthält den Quellcode,
wird bei jedem Deploy neu gebaut und das Ergebnis ins Root kopiert.

```
app/src/
  core/                     Reine Logik, 0 DOM-Abhängigkeit. Fast alles hier unit-getestet.
    types.ts                Datenmodell (TagesEintrag, Wochentyp, ...)
    entry.ts                emptyEntry(), arbeitszeitMinuten(), fehltArbeitszeit()
    formatters.ts           pad(), fmtHHMM(), istVergangenheit(), daysInMonth() u.a.
    holidays.ts             Feiertage, defaultTyp(), dateKey()
    vma.ts                  Verpflegungsmehraufwand-Berechnung
    arbeitszeit.ts          berechneArbeitszeit() – gemeinsame Logik für .xlsx-Export UND
                            In-App-Vorschau; optionaler bisDatum-Parameter für Vorschau
    constants.ts            WOCHENTAGE, MONATSNAMEN, TYP_LABEL, REISEARTEN

  store/                    Storage-Adapter: Appwrite (primär) + IndexedDB (Fallback)
    appwriteStore.ts        Produktiver Appwrite-Adapter mit CDN-Workarounds
    indexedDbStore.ts       Fallback-Adapter
    appwriteId.ts           toAppwriteId() – Schlüssel-Sanitisierung (WICHTIG: Belege haben
                            Präfix receipt_, sihe CLAUDE_CHECKLIST.md)
    appwriteAuth.ts         createAuthClient() – dünner Account-Wrapper für Login
    createStore.ts          Factory: wählt Appwrite oder IndexedDB
    types.ts                KVStore-Interface

  components/               UI-Komponenten, je mit eigenem __tests__/ vorhanden
    MonthView.tsx           Kalender-Monatsansicht (Haupt-View) + SettingsMenu + Swipe
    DayRow.tsx              Eine Tages-Zeile inkl. Flags (Homeoffice, Reiseart fehlt,
                            ⚠ Keine Arbeitszeit erfasst für vergangene Arbeitstage)
    DetailSheet.tsx         Tages-Detailformular (409 Zeilen – größte Datei, bewusst
                            zurückgestellt, Refactoring-Empfehlung siehe "Offene Punkte")
    ExportView.tsx          Export-Vorschau + ZIP-Download-Trigger
    SettingsMenu.tsx        Zahnrad-Menü oben links (Import, Diagnose)
    MonthPreviews.tsx       Ausklappbare Akkordeon-Vorschau in der Monatsansicht
    SpesenPreviewTable.tsx  Wiederverwendbare Spesen-Tabelle (ExportView + MonthPreviews)
    ArbeitszeitPreviewTable.tsx  Wiederverwendbare Arbeitszeiten-Tabelle (MonthPreviews)
    DiagnosePanel.tsx       Controlled Component (open/onClose von außen gesteuert)
    AuthGate.tsx            Login-Gate vor Store-Zugriff; offlineUnknown-Sonderfall: echter
                            Netzwerkfehler (offline) sperrt NICHT aus, nur HTTP-401 tut das
    LoginView.tsx           Login-Formular (Email + Passwort)

  hooks/
    useMonthEntries.ts      Monatseinträge laden, speichern, Monats-Navigation
    useAuth.ts              Appwrite-Session-Verwaltung (checking/loggedIn/loggedOut/
                            offlineUnknown)
    useStore.ts             StoreContext-Hook
    useSwipe.ts             Horizontale Wisch-Geste (Monatswechsel)
    useSwipeDown.ts         Wisch nach unten am Sheet-Griff (Sheet schließen)
    useToast.ts             Toast-Benachrichtigungen

  lib/
    export/                 Die vier Export-Bausteine + Hilfslogik:
      xlsxExport.ts         Spesenabrechnung (.xlsx, XML-Patching der Vorlage)
      receiptMerge.ts       Belege-PDF (pdf-lib)
      arbeitszeitExport.ts  Arbeitszeiten-Übersicht (.xlsx, ExcelJS) – nutzt jetzt
                            core/arbeitszeit.ts statt eigener Berechnungslogik
      zipExport.ts          Bündelt alle vier Dateien (inkl. Rohdaten-Backup)
      backupExport.ts       Rohdaten-Backup (.json) inkl. echter Beleg-Dateien
      exportZeilen.ts       Kosten-Zeilen-Auswahl + summe()/kmPauschale()/vma()
    pdf.ts                  Foto → platzsparendes Graustufen-PDF
    download.ts             triggerDownload() – gemeinsamer Download-Helfer
    pendingReceiptLinks.ts  Offline-/Unterbrechungs-Resilienz beim Beleg-Upload
    exportImport.ts         JSON-Import (Backup wiederherstellen)
    serviceWorker.ts        PWA-Caching (network-first für den eigenen Origin)

test/
  e2e/                      Modularer E2E-Test (login, diagnose über Zahnrad-Menü navigieren)
  e2e.js                    Schlanker Einstiegspunkt (Retry-Wrapper)
  offline-test.js           Separater PWA-/Offline-Test
```

## Datenmodell (TagesEintrag, `app/src/core/types.ts`)

```ts
Wochentyp = 'A' | 'W' | 'F' | 'U' | 'K' | 'G'
Reiseland = 'Deutschland' | 'Österreich' | 'Schweiz'
Reiseart  = '' | 'Anreisetag' | 'Abreisetag' | 'Abwesenheitstag (>8h)' | 'Abwesenheitstag (24h)'
          // 'Abwesenheitstag (<8h)' ist interne Markierung, kein echter VMA-Anspruch

TagesEintrag {
  typ, typManuell, ho,
  start, ende, pause,          // erste Schicht
  start2, ende2, pause2,       // zweite Schicht, leer wenn ungenutzt
  beschreibung,
  km, transport, hotel, bewirtung, sonstiges,
  reiseland, reiseart,
  fr, mi, ab,                  // Mahlzeiten von Firma bezahlt
  receiptIds: string[],
}
```

## Backend (Appwrite Cloud, Frankfurt)

```
Endpoint:    https://fra.cloud.appwrite.io/v1
Project ID:  6a92d8e0002e9b585e39
Database ID: 6a92dad20003b47b4a19
Table ID:    key-value
Bucket ID:   6a92dd0f003962ea7128
```

**Berechtigungen: abgesichert (05.09.2026)** – Tabelle + Bucket auf `user:<Raouls User-ID>`,
kein "Any"-Zugriff mehr. Login (Email+Passwort) zwingend vor jedem Datenzugriff.
Backup: vierte Datei im monatlichen Export-ZIP (`_Rohdaten-Backup.json`).

Wichtiger Fallstrick: Appwrite-fileId für Belege = `toAppwriteId('receipt:' + rid)`, also
**mit `receipt_`-Präfix**. `receiptIds` im Tageseintrag speichert die rohe `rid` OHNE Präfix.

## Appwrite-Absicherung (Login + Berechtigungen)

- `AuthGate.tsx` zeigt Login-Bildschirm VOR jedem Store-Zugriff
- Echter Netzwerkfehler (Offline) = Status `offlineUnknown` → App läuft weiter über IndexedDB
- HTTP-401 = Status `loggedOut` → Login-Formular
- E2E-Test loggt sich über `#settingsBtn` → Zahnrad-Menü navigierbar, Diagnose dahinter
- Secrets: `APPWRITE_EMAIL`, `APPWRITE_PASSWORD` als GitHub-Actions-Secrets

## Der Monats-Export

Button "Monat exportieren" → Export-Vorschau (Spesen-Tabelle + Warn-Banner für unerfasste
Tage) → "Export herunterladen (.zip)" liefert **vier Dateien**:

1. `_Spesenabrechnung-Raoul.xlsx` – XML-Patching der Vorlage
2. `_Belege-Spesenabrechnung-Raoul.pdf` – alle Belege zusammengeführt
3. `_Arbeitszeiten-Raoul.xlsx` – IST/SOLL/EXTRA, Wochensummen, Homeoffice-Quote
4. `_Rohdaten-Backup.json` – alle Einträge + Beleg-Dateien als Base64

Alle vier Bausteine einzeln unit-getestet; `zipExport.ts` fügt nur zusammen.

## In-App-Vorschau (ausklappbar in der Monatsansicht)

Zwei Akkordeon-Panels am Ende der Tagesliste (vor dem Export-Button):

- **Spesenabrechnung-Vorschau**: dieselbe Logik wie ExportView, kein Store-Zugriff, mit
  GESAMT-Zeile (km + €) am Ende
- **Arbeitszeiten-Vorschau**: nutzt `core/arbeitszeit.ts::berechneArbeitszeit(year, month,
  entries, new Date())` – nur Tage bis heute werden berücksichtigt (Zukunft wird ignoriert).
  Export-Baustein lässt `bisDatum` weg und rechnet den ganzen Monat.

Beide Panels berechnen synchron aus den ohnehin geladenen `entries` – kein Netzwerk-Zugriff.

## Zahnrad-Menü (⚙ oben links)

Enthält Import und Diagnose. "Monat exportieren" bleibt eigenständiger Button (monatlich
gebraucht). Zahnrad statt Hamburger-Menü bewusst: App hat nur eine Hauptansicht.

## Markierung unerfasster Arbeitstage

- `core/entry.ts::fehltArbeitszeit(entry, typ)` – Arbeitstag ohne Start/Ende
- `core/formatters.ts::istVergangenheit(year, month, day, referenz?)` – echt vor heute
- `DayRow.tsx`: Flag "⚠ Keine Arbeitszeit erfasst" (wiederverwendet .flag.warn)
- `ExportView.tsx`: warn-banner über der Vorschau-Tabelle

## Backup

vierte Datei im ZIP (`backupExport.ts`) – alle Einträge + Belege als Base64. Kein
automatischer Restore vorhanden (JSON-Import versteht dieses Format nicht, er erwartet das
einfache `entries`-Array ohne Belege – möglicher künftiger Ausbau, nicht eilig).

## Testing

- **240 Unit-Tests** (Vitest, 30 Dateien). `cd app && npm run test`. `npm run verify`
  bündelt Test+Lint+Build – IMMER vor einem Push, der einen Live-Zyklus auslöst.
- **E2E-Test** (Playwright, GitHub Actions) – nur täglich 06:00 UTC oder manuell.
  Letzter Lauf: 05.09.2026 06:13 UTC, `pass: true`, alle 16 Prüfungen grün.
  WICHTIG: Cron-Mails gehen an den GitHub-Account, der die cron:-Zeile zuletzt committete.
  Falls die Mails wieder ausbleiben → Nutzer muss die Zeile selbst im Browser-Editor
  anfassen (siehe CLAUDE_CHECKLIST.md, Abschnitt 0b).
- **Bekannte, akzeptierte Unschärfe:** `importWorked` gelegentlich flakig (Appwrite Eventual
  Consistency). Fix bereits implementiert: 10 Versuche mit Backoff + direkter Appwrite-Read
  als Diagnose ab Versuch 3.
- **Diagnose im E2E**: nicht mehr über `#debugBtn` (existiert nicht mehr), sondern über
  `#settingsBtn` → Zahnrad-Menü → "Diagnose"-Eintrag klicken.

## Bekannte Fallstricke (nicht erneut debuggen)

- **Appwrite receipt_-Präfix**: `toAppwriteId('receipt:' + rid)` → `receipt_<rid>`. Bei
  direkten Storage-Zugriffen immer diesen Pfad nehmen.
- **Appwrite CDN Varnish**: `fetch(url, {cache:'no-store'})` reicht nicht. Cache-Buster
  `&_cb=${Date.now()}` bereits in `appwriteStore.ts` implementiert.
- **Playwright `waitForFunction`**: immer `fn, undefined, options` – drittes Argument!
- **Netzwerksperre Sandbox**: `*.github.io` und `*.appwrite.io` nicht per curl erreichbar.
  Status über GitHub-API oder E2E-Testergebnisse prüfen.
- **GitHub Actions Log-Download**: Azure-Redirect, nicht in Allowlist. Workaround: Log per
  Workflow ins Repo committen, über Contents-API abholen.
- **Node 22** (nicht 20) in Workflows (Vite/jsdom-Kompatibilität).
- **GitHub Token ohne `actions`-Scope**: `workflow_dispatch` per API → 403. Workaround:
  temporärer Branch mit `push`-Trigger. Temporäre Branches immer per API bestätigt löschen.
- **Cron-Email-Zuordnung**: Mails für schedule-Läufe gehen an den Account, der die
  cron:-Zeile zuletzt committete. Claude committet als `claude@anthropic.com` → nicht
  verknüpft. Nutzer selbst im Browser-Editor anfassen lassen.
- **Diagnose-Pfad**: `#debugBtn` existiert NICHT mehr. Weg: `#settingsBtn` → Dropdown →
  "Diagnose".
- **Testdaten in echte Monate schreiben**: Diagnose-Skripte etc. müssen `navigateToSafeTestMonth()`
  nutzen oder explizit einen weit künftigen Monat ansteuern – NIE `dayRows.first()` im
  aktuellen Monat. (05.09.2026: Repro-Skript schrieb in echten 01.09. → Nutzer musste
  manuell aufräumen.)

## Offene Punkte / nächste Schritte

1. **`DetailSheet.tsx` (416 Zeilen)** – Formular-UI, AutoSave-Debounce und Beleg-Upload in
   einer Komponente. Aufteilung in `useAutoSave`, `useReceiptUpload` o.ä. wäre sauberer,
   aber echtes Refactoring-Risiko. **Empfehlung: nur angehen, wenn ohnehin ein neues
   Formularfeld eingebaut wird**, nie auf Vorrat.
2. **Kein Restore aus `_Rohdaten-Backup.json`** – nur manuell nutzbar, kein Ein-Klick-Restore.
   Wäre ein sinnvoller, klar abgegrenzter nächster Schritt wenn gewünscht.
3. **Ungenutzter Appwrite-API-Key "backup-timesync"** (läuft 01.01.2029 ab) + 3 GitHub-Secrets
   vom verworfenen automatischen Backup-Anlauf (`APPWRITE_BACKUP_API_KEY`, `GDRIVE_SERVICE_ACCOUNT_JSON`,
   `GDRIVE_BACKUP_FOLDER_ID`): kein Risiko (rein lesend), aber aufräumen wenn Zeit ist.
4. **August 2026**: keine externe Abgleichsquelle vorhanden. Kein Handlungsbedarf.

## Was NICHT mehr offen ist

- Export → fertig (4 Dateien im ZIP, inkl. Backup)
- Appwrite-Absicherung (Login, Berechtigungen) → fertig, live verifiziert
- Markierung unerfasster Arbeitstage → fertig
- Zahnrad-Menü (Import/Diagnose) → fertig
- In-App-Vorschau (Spesen + Arbeitszeiten) → fertig
- Beschreibungstext-Overflow-Bug (CSS min-width) → behoben
- `importWorked`-Flakigkeit → robuster mit Backoff + direktem Appwrite-Read
