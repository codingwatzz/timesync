# Projekt: Zeiterfassung & Spesenabrechnung

**Stand: 07.09.2026 (Abend) – nach abgeschlossenem Engineering-Review (Architektur/Backend/
Datenmodell/Frontend/Performance/KI-Freundlichkeit/Testing/Deployment) + priorisierter
Abarbeitung der Ergebnisliste. Alle Fakten direkt am frischen Repo/System verifiziert
(npm run verify lokal: 263 Tests grün, `tsc --strict`: 0 Fehler, zwei echte E2E-Läufe
danach: `pass: true, failedChecks: []`, davon einer gegen die neu umgestellte Live-
Deployment-Pipeline). Diese Datei ist die Quelle der Wahrheit – nicht der Chatverlauf.**

## Ziel

Web-App (PWA) zur Erfassung von Arbeitszeiten, Homeoffice-Tagen, Reisekosten und Belegen.

**Live:** https://codingwatzz.github.io/timesync/
**Repo:** https://github.com/codingwatzz/timesync (öffentlich, main-Branch)
**Nutzer:** Raoul Hübner, sqior medical GmbH

## Für Claude: erster Schritt im nächsten Thread

Der Engineering-Review-Auftrag von der letzten Übergabe ist **abgearbeitet** - kein offener
Auftrag mehr für den nächsten Thread. Stattdessen normal mit `CLAUDE_CHECKLIST.md`
weiterarbeiten (Abschnitt 0: GitHub-Token-Status prüfen, bevor größere Arbeit beginnt - u.a.
prüfen, ob der Appwrite-API-Key + die beiden heute genutzten GitHub-Tokens vom Nutzer schon
wie angekündigt (Ende der Woche) rotiert/gelöscht wurden) und die "Offene Punkte" unten als
Ausgangspunkt nehmen, falls der Nutzer nichts Neues vorgibt.

## Engineering-Review 07.09.2026 – Ergebnis + umgesetzte Fixes

Kritisches Review (Senior-Architect/Backend/Frontend-Auftrag, kalibriert auf "Solo-Dev +
KI-Weiterentwicklung", explizit NICHT auf Enterprise-Skalierung) ergab insgesamt eine sehr
solide technische Basis (0 `any`-Verwendungen im ganzen Projekt, saubere Schichtung
core/→store/→hooks/→components/, durchdachte Loading/Error-States). 10 konkrete Findings,
priorisiert nach Nutzen/Aufwand und Stück für Stück abgearbeitet:

1. **🟠 TypeScript `strict` nicht aktiv** (behoben) - in beiden tsconfigs aktiviert, 0
   resultierende Fehler dank bereits sauberem Typisierungsstil.
2. **🟠 `KVStore.get/set/delete` verschluckten echte Fehler** (behoben) - warfen bei
   Netzwerk-/Berechtigungsfehlern nur ein Log, gaben aber "Erfolg" zurück (ein
   fehlgeschlagener Beleg-Upload z.B. schrieb trotzdem die Metadaten-Zeile). Jetzt: werfen
   bei echten Fehlern, `null` nur wenn ein Schlüssel wirklich nicht existiert
   (`isNotFoundError()` steuert auch den `updateRow`→`createRow`-Upsert-Fallback statt eines
   blinden Catch-All). Alle 7 betroffenen Aufrufer (`useMonthEntries.ts`, `App.tsx`,
   `DetailSheet.tsx`, `lib/importPlan.ts`) zeigen Fehler jetzt per Toast, statt sie stumm zu
   verschlucken - inkl. `hasUnsavedRef`, das bei einem Fehlschlag bewusst `true` bleibt (Retry
   statt fälschlichem "gespeichert"). Neuer dedizierter Test `store/__tests__/appwriteStore.test.ts`
   (gemockter Appwrite-Client) - vorher die einzige zentrale Store-Datei ohne eigenen Test.
3. **🟠 Deploy-Architektur** (behoben) - Build-Output wurde bei jedem Deploy direkt in den
   `main`-Root committet (Ausnahmeliste für Root-Dateien, zwei echte versehentliche
   Root-Löschungen 01./02.09.2026). Umgestellt auf die offizielle GitHub-Pages-Actions-
   Bereitstellung (`actions/upload-pages-artifact` + `actions/deploy-pages`,
   Repo-Settings → Pages → Source = "GitHub Actions"). `main` enthält jetzt nur noch
   Quellcode + Doku, die alten Build-Artefakte im Root wurden entfernt. Live per E2E gegen
   die neu ausgelieferte Seite verifiziert.
4. **🟡 Serielles Beleg-Nachladen** (behoben) - `backupExport.ts` + `receiptMerge.ts` luden
   Belege eines Exports nacheinander statt parallel; jetzt `Promise.all`, Reihenfolge bleibt
   erhalten.
5. **🟡 Alte Vorfalls-Erzählungen in `CLAUDE_CHECKLIST.md`** (behoben) - von 306 auf 238
   Zeilen eingedampft, keine Regel verloren, nur erledigte Bug-Geschichten auf die reine,
   noch handlungsrelevante Regel gekürzt.
6. **Aufräumarbeiten**: 3 ungenutzte GitHub-Secrets vom verworfenen Auto-Backup-Anlauf
   gelöscht (`APPWRITE_BACKUP_API_KEY`, `GDRIVE_BACKUP_FOLDER_ID`,
   `GDRIVE_SERVICE_ACCOUNT_JSON`) - nur noch `APPWRITE_EMAIL`/`APPWRITE_PASSWORD` aktiv.

**Bewusst NICHT angefasst (siehe "Offene Punkte" unten für Details, warum):**
- 🟡 Kein Schema-Versionsfeld in gespeicherten Einträgen - erst bei tatsächlicher
  Datenmodell-Änderung einführen, nicht auf Vorrat.
- 🟢 ExcelJS (~900KB) für `arbeitszeitExport.ts` - bereits lazy-geladen, kein konkreter
  Leidensdruck, nicht ersetzen ohne Anlass.
- 🟢 `DetailSheet.tsx`-Aufteilung - weiterhin zurückgestellt bis zur nächsten inhaltlichen
  Änderung an dieser Datei.
- Ein-Klick-Restore aus `_Rohdaten-Backup.json` - unverhältnismäßiger Aufwand für den
  Anlassfall, nur auf expliziten Wunsch bauen.

## UX/UI-Review 06.09.2026 – zur Erinnerung, weiterhin gültig

4 Fixes umgesetzt (Import-Bestätigung, komma-sichere Betragsfelder, aria-labels
Monatswechsel, Ladefeedback AuthGate) - Details siehe Git-Historie. 2 Punkte bewusst NICHT
angefasst (Nutzerentscheidung, weiterhin gültig):
- 🟡 Touch-Target-Ausnahme bei Wochenendzeilen in `DayRow.tsx` - lassen.
- 🟢 Swipe-Geste zur Tagesnavigation überlappt theoretisch mit Textauswahl - lassen.

## Architektur

React 19 + TypeScript (Vite-Build, `strict: true` seit 07.09.2026). `app/` enthält den
gesamten Quellcode. Deployment läuft über GitHub-Pages-Actions-Bereitstellung (siehe eigenes
Kapitel "Deployment" unten) - `main` enthält KEINEN Build-Output mehr, nur Quellcode + Doku.

```
app/src/
  core/                     Reine Logik, 0 DOM-Abhängigkeit. Fast alles hier unit-getestet.
    types.ts                Datenmodell (TagesEintrag, Wochentyp, ...)
    entry.ts                emptyEntry(), arbeitszeitMinuten(), fehltArbeitszeit()
    formatters.ts           pad(), fmtHHMM(), istVergangenheit(), daysInMonth(),
                            toNumber() (seit 06.09.2026 komma-sicher: "," UND "."
                            als Dezimaltrennzeichen - EINZIGE Zahl-Parser-Implementierung
                            im Projekt, siehe UX-Review-Kapitel oben), sanitizeAmountInput()
    holidays.ts             Feiertage, defaultTyp(), dateKey()
    vma.ts                  Verpflegungsmehraufwand-Berechnung
    arbeitszeit.ts          berechneArbeitszeit() – gemeinsame Logik für .xlsx-Export UND
                            In-App-Vorschau; optionaler bisDatum-Parameter für Vorschau
    constants.ts            WOCHENTAGE, MONATSNAMEN, TYP_LABEL, REISEARTEN

  store/                    Storage-Adapter: Appwrite (primär) + IndexedDB (Fallback).
                            KVStore-Vertrag seit 07.09.2026: get/set/delete werfen bei
                            ECHTEN Fehlern, `null` nur wenn ein Schlüssel wirklich nicht
                            existiert (siehe Engineering-Review-Kapitel oben, Punkt 2)
    appwriteStore.ts        Produktiver Appwrite-Adapter mit CDN-Workarounds. Jetzt mit
                            eigenem Unit-Test (gemockter Client), siehe __tests__/
    indexedDbStore.ts       Fallback-Adapter
    appwriteId.ts           toAppwriteId() – Schlüssel-Sanitisierung (WICHTIG: Belege haben
                            Präfix receipt_, sihe CLAUDE_CHECKLIST.md)
    appwriteAuth.ts         createAuthClient() – dünner Account-Wrapper für Login
    createStore.ts          Factory: wählt Appwrite oder IndexedDB
    types.ts                KVStore-Interface

  components/               UI-Komponenten, je mit eigenem __tests__/ vorhanden. ALLE auf
                            Tailwind + Design-System umgestellt (siehe eigenes Kapitel oben).
    MonthView.tsx           Kalender-Monatsansicht (Haupt-View) + SettingsMenu + Swipe.
                            Export-Button wird zu normalem (nicht-schwebendem) Button,
                            sobald ein Vorschau-Panel offen ist (verdeckte sonst Inhalte)
    DayRow.tsx              Eine Tages-Zeile inkl. Flags (Homeoffice, Reiseart fehlt,
                            ⚠ Keine Arbeitszeit erfasst für vergangene Arbeitstage). "km"
                            neutral (kein Akzent), "extern" nutzt eigene info-Farbe
    DetailSheet.tsx         Tages-Detailformular (größte Datei, Refactoring-Empfehlung siehe
                            "Offene Punkte"). Enthält: Tagestyp-Legende (ⓘ-Popover),
                            Bestätigungsdialog bei Tagestyp-Wechsel mit Bestandsdaten,
                            Freischalt-Logik für Nicht-Arbeitstage, Beleg-zu-Feld-Zuordnung
                            (`BelegMeta.feld`). Betragsfelder (km/Transport/Hotel/Bewirtung/
                            Sonstiges) seit 06.09.2026 `type="text" inputMode="decimal"`
                            (nicht mehr `type="number"`, siehe UX-Review-Kapitel oben)
    ImportConfirmDialog.tsx NEU (06.09.2026) - Bestätigungsdialog vor jedem Import: Format-
                            Hinweis, Anzahl Einträge/Zeitraum, Überschreib-Warnung, optionaler
                            Sicherheitskopie-Download. Siehe UX-Review-Kapitel oben.
    ExportView.tsx          Export-Vorschau + ZIP-Download-Trigger
    SettingsMenu.tsx        Zahnrad-Menü oben links (Light/Dark-Umschalter, Import, Diagnose)
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
    useTheme.ts             Light/Dark-Umschalter (Klasse "light" auf <html>, Präferenz
                            in localStorage - reine UI-Präferenz, bewusst nicht über
                            Appwrite synchronisiert)
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
    exportImport.ts         parseImportFile() – parst/validiert eine Import-Datei, schreibt
                            NICHTS (seit 06.09.2026, siehe UX-Review-Kapitel oben)
    importPlan.ts           NEU (06.09.2026) - buildImportPlan() (prüft Überschreibungen),
                            downloadPreImportBackup(), applyImportPlan() (schreibt erst nach
                            Bestätigung im ImportConfirmDialog)
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

BelegMeta {
  id, name, mime, createdAt, date, dataUrl?,
  feld?: '' | 'transport' | 'hotel' | 'bewirtung' | 'sonstiges',
  // NEU (06.09.2026): rein informative Zuordnung zu einem Kostenfeld, steuert nur die
  // "Kein Beleg zugeordnet"-Warnung in DetailSheet.tsx - fließt NICHT in den Export ein.
}
```

**Wichtige Eigenheit:** `emptyEntry()` (core/entry.ts) setzt `ho: true` als Standard für
JEDEN neuen Tag, unabhängig vom Tagestyp - das ist kein Nutzer-Signal, sondern reiner
Default. Bei Prüfungen wie "hat dieser Tag schon echte Daten?" NIEMALS `ho` alleine als
Signal werten (siehe `DetailSheet.tsx::hatVersteckbareDaten()` für ein korrektes Beispiel -
prüft bewusst NICHT `ho`).

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

- **263 Unit-Tests** (Vitest, 35 Dateien) - `tsc --strict`: 0 Fehler. `cd app && npm run
  test`. `npm run verify` bündelt Test+Lint+Build – IMMER vor einem Push, der einen
  Live-Zyklus auslöst.
- **E2E-Test** (Playwright, GitHub Actions) – nur täglich 06:00 UTC oder manuell per
  `workflow_dispatch`. Letzter Lauf: 07.09.2026 (nach Deploy-Umstellung, gegen die neu
  ausgelieferte Live-Seite), `pass: true, failedChecks: []`.
  WICHTIG: Cron-Mails gehen an den GitHub-Account, der die cron:-Zeile zuletzt committete.
  Falls die Mails wieder ausbleiben → Nutzer muss die Zeile selbst im Browser-Editor
  anfassen (siehe CLAUDE_CHECKLIST.md, Abschnitt 0b).
- **Bekannte, akzeptierte Unschärfe:** `importWorked` gelegentlich flakig (Appwrite Eventual
  Consistency). Fix bereits implementiert: 10 Versuche mit Backoff + direkter Appwrite-Read
  als Diagnose ab Versuch 3.
- **Diagnose im E2E**: nicht mehr über `#debugBtn` (existiert nicht mehr), sondern über
  `#settingsBtn` → Zahnrad-Menü → "Diagnose"-Eintrag klicken.

## Deployment

Seit 07.09.2026: offizielle GitHub-Pages-Actions-Bereitstellung
(`.github/workflows/deploy-production.yml`, zwei Jobs `build`→`deploy`,
`actions/upload-pages-artifact` + `actions/deploy-pages`). Repo-Settings → Pages → Source =
"GitHub Actions" (`build_type: "workflow"`, per API bestätigt). Test/Lint/Build +
CI-Log-bei-Fehlschlag-Mechanik unverändert aus dem alten Workflow übernommen (Grund: Claudes
Sandbox kann GitHub-Actions-Logs nicht direkt abrufen, siehe CLAUDE_CHECKLIST.md Abschnitt 0).

**Vorteil ggü. der alten Lösung** (Build-Output-Commit in `main`-Root + Ausnahmeliste): main
enthält jetzt nur noch Quellcode, das zweimal real aufgetretene Root-Lösch-Risiko
(README/CLAUDE_CHECKLIST/`tools/` versehentlich mitgelöscht) ist strukturell nicht mehr
möglich, nicht nur behoben.

## Offene Punkte / nächste Schritte

1. **`DetailSheet.tsx`** – Formular-UI, AutoSave-Debounce und Beleg-Upload in einer
   Komponente. Aufteilung in `useAutoSave`, `useReceiptUpload` o.ä. wäre sauberer, aber
   echtes Refactoring-Risiko. **Empfehlung: nur angehen, wenn ohnehin ein neues
   Formularfeld eingebaut wird**, nie auf Vorrat.
2. **Kein Restore aus `_Rohdaten-Backup.json`** – nur manuell nutzbar, kein Ein-Klick-Restore.
   Unverhältnismäßiger Aufwand für den Anlassfall (Merge-Logik + Belege re-uploaden) - nur
   auf expliziten Wunsch bauen, nicht proaktiv.
3. **Ungenutzter Appwrite-API-Key "backup-timesync"** (läuft 01.01.2029 ab) - muss der Nutzer
   selbst in der Appwrite-Konsole löschen (kein API-Zugriff dafür). Die 3 zugehörigen
   GitHub-Secrets sind bereits gelöscht (07.09.2026).
4. **August 2026**: keine externe Abgleichsquelle vorhanden. Kein Handlungsbedarf.
5. **Zwei GitHub-Tokens vom 06./07.09.2026** – im Chat für Push/Secrets/Pages-Umstellung
   verwendet. Nutzer hat angekündigt, beide **Ende dieser Woche** zu rotieren/widerrufen -
   beim übernächsten Thread ggf. nachfragen, ob erledigt.
6. **Kein Schema-Versionsfeld** in gespeicherten `TagesEintrag`-Zeilen (Engineering-Review,
   Punkt 6) – bewusst NICHT proaktiv eingeführt (kein Overengineering für eine Ein-Personen-
   App ohne konkreten Anlass). Erst einführen, wenn tatsächlich mal ein Feld
   umbenannt/entfernt wird, dann als Teil DIESER Änderung.
7. **`DayRow.tsx`-Touch-Target bei Wochenendzeilen** und **Swipe-/Textauswahl-Überlappung**
   in `DetailSheet.tsx` (UX-Review, Punkte 5/6) – bewusst nicht angefasst, nicht erneut
   vorschlagen, außer der Nutzer bringt es selbst wieder auf.
8. **ExcelJS (~900KB) in `arbeitszeitExport.ts`** (Engineering-Review, Punkt 7) – bewusst
   nicht ersetzt, bereits lazy-geladen, kein konkreter Leidensdruck. Nur auf expliziten
   Wunsch/bei echter Beschwerde über langsame Exports angehen.

## Was NICHT mehr offen ist

- Export → fertig (4 Dateien im ZIP, inkl. Backup)
- Appwrite-Absicherung (Login, Berechtigungen) → fertig, live verifiziert
- Markierung unerfasster Arbeitstage → fertig
- Zahnrad-Menü (Import/Diagnose) → fertig
- In-App-Vorschau (Spesen + Arbeitszeiten) → fertig
- Beschreibungstext-Overflow-Bug (CSS min-width) → behoben
- `importWorked`-Flakigkeit → robuster mit Backoff + direktem Appwrite-Read
- Beleg-Upload/-Persistieren/-Löschen → fertig, per E2E bestätigt
- Beleg-zu-Feld-Zuordnung, Bestätigungsdialog bei Tagestyp-Wechsel, Felder bei
  Nicht-Arbeitstagen ausblenden → fertig
- **UX/UI-Review 06.09.2026** (Import-Bestätigung, komma-sichere Betragsfelder, aria-labels
  Monatswechsel, Ladefeedback AuthGate) → fertig
- **Engineering-Review 07.09.2026** (strict TypeScript, Store-Fehlerbehandlung inkl. Test,
  Deploy-Umstellung auf `actions/deploy-pages`, parallele Beleg-Ladevorgänge,
  Checkliste eingedampft, 3 ungenutzte GitHub-Secrets gelöscht) → fertig, siehe eigenes
  Kapitel oben. Kein offener Review-Auftrag mehr für den nächsten Thread.

## Bekannte Fallstricke (nicht erneut debuggen, Details siehe CLAUDE_CHECKLIST.md)

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
- **Cron-Email-Zuordnung**: Mails für schedule-Läufe gehen an den Account, der die
  cron:-Zeile zuletzt committete. Nutzer selbst im Browser-Editor anfassen lassen.
- **Diagnose-Pfad**: `#debugBtn` existiert NICHT mehr. Weg: `#settingsBtn` → Dropdown →
  "Diagnose".
- **Testdaten in echte Monate schreiben**: Diagnose-Skripte müssen `navigateToSafeTestMonth()`
  nutzen oder explizit einen weit künftigen Monat ansteuern – NIE den aktuellen Monat.
- **CSS-Klassen, die NUR noch als E2E-Test-Selektor dienen, beim Restyling übersehen**:
  fünfmal real passiert. **Regel: vor JEDER Komponenten-Restyle-Aufgabe alle Selektoren aus
  `test/e2e/*.js` + `test/e2e/steps/*.js` extrahieren** und einzeln gegen den neuen Code
  prüfen, danach trotzdem einen echten E2E-Lauf einplanen.
- **Tailwind v4: Utility-Name für mehrteilige Theme-Token-Namen ist der VOLLE Suffix nach
  `--color-`.** `--color-text-on-accent` → Klasse `text-text-on-accent`/`bg-text-on-accent`,
  NICHT `text-on-accent`.
- **`git push` nach Deploy/E2E-Läufen routinemäßig als "rejected" erwarten** - beide committen
  automatisch zurück. Vor jedem eigenen Push: `git fetch origin main && git rebase origin/main`.
- **Fine-grained GitHub-PATs**: Details zu Token-Scopes siehe CLAUDE_CHECKLIST.md Abschnitt 0.

## Design-System (Tailwind + "Indigo & Ocean", fertig seit 06.09.2026)

**Komplettes UI-Redesign abgeschlossen** – alle Screens (Tagesansicht, Monatsübersicht,
Export-Ansicht, Login) von der alten Plain-CSS-"Papier"-Optik auf Tailwind CSS v4 +
ein neues, skalierbares Token-System umgestellt. Kein Zwischenzustand mehr, kein Screen
läuft mehr auf dem alten Look.

**Tokens** (`app/src/index.css`, `@theme`-Block + `:root.light`-Override):
```
--color-canvas/surface/surface-2/border   Oberflächen-Ebenen
--color-text/text-muted/text-faint/text-on-accent   Textfarben
--color-primary/primary-strong/primary-soft   Indigo (Haupt-CTA, Tagestyp "A")
--color-secondary/secondary-strong/secondary-soft   Ocean Blue (Tagestyp "U")
--color-info/info-soft   Status-Flags (z.B. "extern") - bewusst von secondary entkoppelt,
                          damit sich der Ton unabhängig von der U-Tagestyp-Füllung auf
                          WCAG-AA abstimmen lässt
--color-success/warning/danger (+ -soft)   Semantische Zustände
--color-tab-a/w/f/u/k/g   Tagestyp-Farben
```
**Light/Dark-Mode**: Umschalter im Zahnrad-Menü (`useTheme.ts`-Hook, Präferenz in
localStorage). Toggeln setzt/entfernt nur die Klasse `light` auf `<html>` -
Farb-Tokens sind dieselben Variablennamen in beiden Modi, kein Component-Code
unterscheidet zwischen den Modi.

**Icons**: durchgängig `lucide-react` statt Emoji (Settings/Upload/Wrench/Cloud/
ChevronLeft-Right-Up-Down/Home/Plane/AlertTriangle/Receipt/BarChart3/ArrowLeft/Download/
Sun/Moon/Info/ShieldAlert/FileText/X/Plus/Paperclip/Camera).

**Accessibility-Konventionen** (gelten projektweit für neue UI):
- Touch-Targets mindestens 44×44px (`min-h-11 min-w-11` o.ä.)
- `focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none` auf JEDEM
  interaktiven Element (Buttons, Karten mit onClick, nicht nur Inputs)
- Platzhalter-/Sekundärtext (`text-faint`) auf WCAG-AA-Kontrast (≥4.5:1) geeicht

**⚠️ WICHTIGSTE LEHRE aus dem Redesign** (mehrfach real passiert, siehe
CLAUDE_CHECKLIST.md): Beim Umstylen einer Komponente werden alte CSS-Klassennamen entfernt,
die AUSSCHLIESSLICH noch als E2E-Test-Selektor dienten (keine Styling-Funktion mehr) - das
bricht `test/e2e/` lautlos, oft erst beim nächsten geplanten Lauf bemerkt. **Vor JEDER
Komponenten-Restyle-Aufgabe:** alle Selektoren aus `test/e2e/*.js` und `test/e2e/steps/*.js`
extrahieren (Klassen UND IDs, aus den tatsächlichen `locator/click/querySelector`-Aufrufen,
nicht nur überfliegen) und einzeln gegen den neuen Code prüfen.

`npm run verify` vor jedem Push (Lint + Build). CSS-/Component-Änderungen lösen einen Deploy
aus (alles unter `app/**`), aber KEINEN automatischen E2E-Lauf mehr (nur täglich 06:00 UTC
oder manuell per `workflow_dispatch`, siehe CLAUDE_CHECKLIST.md Abschnitt 0).
