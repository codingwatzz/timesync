# Projekt: Zeiterfassung & Spesenabrechnung

**🎉 Version 01 – 08.09.2026, offiziell eingefroren (Git-Tag `v0.1.0`).** Release-Audit
bestanden (siehe Kapitel "V01 Release-Audit" unten). Alle Fakten direkt am frischen
Repo/System verifiziert (npm run verify lokal: 296 Tests grün, `tsc --strict`: 0 Fehler,
mehrere echte E2E-Läufe: `pass: true, failedChecks: []`). Diese Datei ist die Quelle der
Wahrheit – nicht der Chatverlauf.

## Ziel

Web-App (PWA) zur Erfassung von Arbeitszeiten, Homeoffice-Tagen, Reisekosten und Belegen -
inkl. Beleg-Zuordnung zu Reisen/Terminen und Unterstützung der Reisekostenabrechnung.

**Live:** https://codingwatzz.github.io/timesync/
**Repo:** https://github.com/codingwatzz/timesync (öffentlich, main-Branch, Tag `v0.1.0`)
**Nutzer:** Raoul Hübner, sqior medical GmbH

## Für Claude: erster Schritt im nächsten Thread

**V01 ist fertig und eingefroren - kein aktiver Entwicklungsauftrag mehr.** Der Nutzer
sammelt neue Ideen/Wünsche ab jetzt zunächst nur in "V02-Backlog" (siehe unten), um sie
irgendwann gebündelt anzugehen - nicht sofort einzeln umsetzen, außer er sagt das explizit.
Erster Schritt trotzdem: `CLAUDE_CHECKLIST.md` Abschnitt 0 (GitHub-Token-Status prüfen -
zwei Tokens vom 06./07.09.2026 sollten laut Ankündigung "Ende der Woche" rotiert worden
sein, kurz nachfragen falls relevant).

## V01 Release-Audit (08.09.2026) – Ergebnis

Finaler, adversarialer Release-Audit (Rolle: QA Engineer + Architekt + UX-Reviewer,
Auftrag: "wie könnte ich diese App kaputtmachen", explizit KEIN Feature-Ausbau) vor dem
Einfrieren als V01. Ergebnis: **RELEASE V01** – 0 kritische, 0 hohe, 3 mittlere (dokumentiert
für V02, siehe dort), 4 niedrige Punkte (kein Handlungsbedarf).

**Einziger im Audit selbst gefundener + behobener Fund:** "Ende vor Start" bzw. "Pause
länger als Schicht" wurde von `arbeitszeitMinuten()` zwar schon korrekt auf 0 Minuten
gekappt (kein Absturz, keine negative Zeit) - aber ohne jede Rückmeldung, WARUM die
eingetragene Zeit nicht zählt. Neue, sichtbare Warnung direkt im Formular
(`core/entry.ts::schichtUnplausibel()`, unabhängig für beide Schichten).

Alle anderen kritischen Kategorien (Datenverlust, Persistenz-Race-Conditions, falsche
Berechnungen) waren bereits durch die beiden vorangegangenen Reviews abgedeckt - siehe
"Historie bis V01" unten für die Details dazu.

## Historie bis V01 (kondensiert - Details siehe Git-Historie)

Drei große Arbeitsrunden führten zu V01:

1. **UX/UI-Review (06.09.2026):** Import-Bestätigung mit Überschreib-Warnung, komma-sichere
   Betragsfelder, aria-labels, Ladefeedback, Zeilenhöhe/Arbeitsstunden-Anzeige,
   Legende-Button.
2. **Engineering-Review (07.09.2026):** `strict` TypeScript, Store-Fehlerbehandlung
   (`KVStore.get/set/delete` werfen jetzt bei echten Fehlern statt lautlos "Erfolg" zu
   meiden), Deploy-Umstellung auf offizielle GitHub-Pages-Actions-Bereitstellung (main
   enthält seitdem NUR Quellcode, kein Build-Output mehr), parallele Beleg-Ladevorgänge.
3. **Nutzerwünsche + 2 kritische Live-Bugs (07.09.2026, Abend):** Restore aus dem
   Rohdaten-Backup (inkl. echter Beleg-Dateien), "Zeitraum auf Tagestyp setzen" (Bulk-Urlaub
   ohne Einzeltage anzuklicken), Homeoffice-Flag-Bug an Nicht-Arbeitstagen behoben. **Zwei
   echte, live bestätigte Datenintegritäts-Bugs gefunden und behoben:** (a) ein
   fehlgeschlagener Beleg-Download wurde als Dateiinhalt übernommen und hat damit einen
   echten Beleg überschrieben (`appwriteStore.ts::get()` prüfte `resp.ok` nicht), (b) die
   eigentliche Ursache dahinter - der Datei-Download lief ohne `credentials:'include'` und
   schlug seit der Appwrite-Absicherung (05.09.2026) für JEDEN Beleg fehl, nicht nur den
   einen beschädigten.

## Architektur

React 19 + TypeScript (Vite-Build, `strict: true`). `app/` enthält den gesamten Quellcode.
Deployment läuft über GitHub-Pages-Actions-Bereitstellung (siehe eigenes Kapitel
"Deployment" unten) - `main` enthält KEINEN Build-Output mehr, nur Quellcode + Doku.

```
app/src/
  core/                     Reine Logik, 0 DOM-Abhängigkeit. Fast alles hier unit-getestet.
    types.ts                Datenmodell (TagesEintrag, Wochentyp, ...)
    entry.ts                emptyEntry(), arbeitszeitMinuten(), fehltArbeitszeit(),
                            hatVersteckbareDaten(), schichtUnplausibel() (V01-Release-Audit:
                            Warnung bei "Ende vor Start"/Pause zu lang)
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
    DayRow.tsx              Eine Tages-Zeile inkl. Flags (Homeoffice NUR bei typ==='A',
                            Reiseart fehlt, ⚠ Keine Arbeitszeit erfasst für vergangene
                            Arbeitstage). Kompakte Darstellung für ALLE Nicht-Arbeitstage
                            (isKompakt, nicht nur Wochenende). "km" neutral (kein Akzent),
                            "extern" nutzt eigene info-Farbe
    DetailSheet.tsx         Tages-Detailformular (größte Datei, Refactoring-Empfehlung siehe
                            "Offene Punkte"). Enthält: Tagestyp-Legende (ⓘ-Popover),
                            Bestätigungsdialog bei Tagestyp-Wechsel mit Bestandsdaten,
                            Freischalt-Logik für Nicht-Arbeitstage, Beleg-zu-Feld-Zuordnung
                            (`BelegMeta.feld`). Betragsfelder (km/Transport/Hotel/Bewirtung/
                            Sonstiges) seit 06.09.2026 `type="text" inputMode="decimal"`
                            (nicht mehr `type="number"`, siehe UX-Review-Kapitel oben)
    ImportConfirmDialog.tsx Bestätigungsdialog vor jedem Import/Restore: Format-Hinweis,
                            Anzahl Einträge/Zeitraum/Belege, Überschreib-Warnung, optionaler
                            Sicherheitskopie-Download.
    BulkTypDialog.tsx       "Zeitraum auf Tagestyp setzen" (07.09.2026) - Formular (Typ+Von+
                            Bis) → Übersicht+Bestätigung (behalten/löschen bei bestehenden
                            Daten). Wochenenden/Feiertage automatisch übersprungen.
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
    importPlan.ts           buildImportPlan() (prüft Überschreibungen, versteht auch das
                            volle Rohdaten-Backup-Format inkl. Belegen), downloadPreImportBackup(),
                            applyImportPlan() (schreibt erst nach Bestätigung)
    bulkTyp.ts              buildBulkTypPlan()/applyBulkTypPlan() - "Zeitraum auf Tagestyp
                            setzen", überspringt Wochenenden/Feiertage automatisch
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

Vierte Datei im ZIP (`backupExport.ts`) – alle Einträge + Belege als echte Dateien (Base64).
**Vollständig wiederherstellbar** über den normalen Import-Dialog (`exportImport.ts` erkennt
das Format `zeiterfassung-backup-v1` automatisch, `lib/importPlan.ts` restauriert Einträge
UND lädt jeden Beleg als echte Datei erneut nach Appwrite Storage hoch, inkl.
Kostenfeld-Zuordnung). Ein Backup ist immer nur für den Monat, in dem es exportiert wurde -
für einen vollständigen Restore braucht es die Export-Datei jedes einzelnen Monats.

## Testing

- **296 Unit-Tests** (Vitest) - `tsc --strict`: 0 Fehler. `cd app && npm run
  test`. `npm run verify` bündelt Test+Lint+Build – IMMER vor einem Push, der einen
  Live-Zyklus auslöst.
- **E2E-Test** (Playwright, GitHub Actions) – nur täglich 06:00 UTC oder manuell per
  `workflow_dispatch`. Deckt den kompletten Kernworkflow ab: Eintrag anlegen → Beleg
  hochladen → Reload/Persistenz → Export → Import → Restore (inkl. Beleg-Wiederherstellung)
  → Aufräumen. Letzter Lauf (08.09.2026, V01-Release-Audit): `pass: true, failedChecks: []`.
  WICHTIG: Cron-Mails gehen an den GitHub-Account, der die cron:-Zeile zuletzt committete.
  Falls die Mails wieder ausbleiben → Nutzer muss die Zeile selbst im Browser-Editor
  anfassen (siehe CLAUDE_CHECKLIST.md, Abschnitt 0b).
- **Bekannte, akzeptierte Unschärfe:** `importWorked` gelegentlich flakig (Appwrite Eventual
  Consistency). Fix bereits implementiert: 10 Versuche mit Backoff + direkter Appwrite-Read
  als Diagnose ab Versuch 3.
- **Diagnose im E2E**: nicht mehr über `#debugBtn` (existiert nicht mehr), sondern über
  `#settingsBtn` → Zahnrad-Menü → "Diagnose"-Eintrag klicken.
- **Noch kein dedizierter E2E-Test** für "Zeitraum auf Tagestyp setzen" (nur Unit-Tests) -
  bewusste Abwägung, siehe V02-Backlog.

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

## Feature-Umfang V01 (fertig, nicht mehr im Detail auflisten)

Arbeitszeit-/Homeoffice-Erfassung, Reisekosten + Belege (Upload, Feld-Zuordnung, Löschen),
Monats-Export (4 Dateien: Spesenabrechnung.xlsx, Belege.pdf, Arbeitszeiten.xlsx,
Rohdaten-Backup.json), vollständiger Restore aus dem Backup, Import mit
Überschreib-Bestätigung, "Zeitraum auf Tagestyp setzen" (Bulk-Urlaub), In-App-Vorschau
(Spesen + Arbeitszeiten), Markierung unerfasster Arbeitstage, Appwrite-Absicherung
(Login-Pflicht, keine "Any"-Berechtigung mehr), Light/Dark-Mode. Alles per Unit-Tests +
mindestens ein echter E2E-Lauf verifiziert.

## V02-Backlog (noch nicht priorisiert - hier sammeln, bis gebündelt angegangen wird)

**Aus dem V01-Release-Audit (08.09.2026), bewusst zurückgestellt:**
- Kein Schema-Versionsfeld in gespeicherten `TagesEintrag`-Zeilen - erst bei tatsächlicher
  Datenmodell-Änderung einführen, nicht auf Vorrat.
- ExcelJS (~900KB) in `arbeitszeitExport.ts` - bereits lazy-geladen, kein konkreter
  Leidensdruck. Nur auf expliziten Wunsch/bei echter Beschwerde angehen.
- `DetailSheet.tsx`-Aufteilung (größte Datei) - nur angehen, wenn ohnehin ein neues
  Formularfeld eingebaut wird, nie auf Vorrat.
- Moderate npm-audit-Meldung (transitiv `exceljs`→`uuid`) - reale Angriffsfläche in dieser
  Client-Side-App sehr gering, Fix würde ein Breaking-Change-Downgrade erzwingen.
- "Zeitraum auf Tagestyp setzen" hat noch keinen dedizierten E2E-Test (nur Unit-Tests).

**Aus früheren Reviews, weiterhin bewusst unangetastet (Nutzerentscheidung):**
- Touch-Target-Ausnahme bei Wochenendzeilen in `DayRow.tsx` - lassen.
- Swipe-Geste zur Tagesnavigation überlappt theoretisch mit Textauswahl - lassen.
- August 2026: keine externe Abgleichsquelle vorhanden - kein Handlungsbedarf.

**Noch offen, unabhängig von der App selbst:**
- Zwei GitHub-Tokens vom 06./07.09.2026 – Nutzer hat Rotation "Ende der Woche" angekündigt,
  bei Gelegenheit nachfragen, ob erledigt.

*(Neue Punkte einfach hier anhängen, wenn sie im nächsten Thread aufkommen.)*

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
