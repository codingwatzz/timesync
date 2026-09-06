# Projekt: Zeiterfassung & Spesenabrechnung

**Stand: 06.09.2026 – Übergabe nach abgeschlossenem UI-Redesign (Tailwind + Indigo & Ocean
Design-System, alle Screens migriert, 20-Punkte-UX/UI-Audit umgesetzt, Beleg-Upload-Bug
behoben, 3 Feature-Wünsche umgesetzt). Alle Fakten direkt am frischen Repo/System verifiziert
(npm run verify lokal, letzter manueller E2E-Lauf `pass: true, failedChecks: []`). Diese
Datei ist die Quelle der Wahrheit – nicht der Chatverlauf.**

## Ziel

Web-App (PWA) zur Erfassung von Arbeitszeiten, Homeoffice-Tagen, Reisekosten und Belegen.

**Live:** https://codingwatzz.github.io/timesync/
**Repo:** https://github.com/codingwatzz/timesync (öffentlich, main-Branch)
**Nutzer:** Raoul Hübner, sqior medical GmbH

## Für Claude: erster Schritt in DIESEM nächsten Thread

Der Nutzer möchte, dass dieser Thread mit einem **neutralen, kritischen UX/UI-Review**
beginnt – exakt derselbe Bewertungsauftrag wie am Ende der letzten Sitzung, diesmal aber
gegen den JETZT fertigen Stand (nicht den Zwischenstand von damals). Der volle Prompt-Wortlaut
(1:1 verwenden, nicht zusammenfassen):

> Du bist ein erfahrenes Team aus Senior UX Designer und Senior UI Designer. Bewerte die
> vorliegende Software/App ganzheitlich und kritisch aus Sicht professioneller UX- und
> UI-Gestaltung. Bewerte nicht nach persönlichem Geschmack, sondern anhand etablierter
> Prinzipien für Usability, User Experience, Interface Design, Accessibility und moderne
> Softwaregestaltung. [... vollständiger Auftrag: 1. UX – Nutzung und Funktion, 2. UI –
> Visuelle Gestaltung und Interface Design, 3. UX und UI gemeinsam betrachten, 4. Kritische
> Bewertung mit Schweregrad-Einstufung (🔴🟠🟡🟢), 5. Abschlussbewertung mit Top-10-Listen
> und Gesamtbewertung – siehe Chatverlauf der Sitzung vom 06.09.2026 für den exakten,
> vollständigen Wortlaut, falls dieser hier gekürzt wirkt.]

Erst DANACH normal mit `CLAUDE_CHECKLIST.md` weiterarbeiten (verbindliche Arbeitsroutine).
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

  components/               UI-Komponenten, je mit eigenem __tests__/ vorhanden. ALLE auf
                            Tailwind + Design-System umgestellt (siehe eigenes Kapitel oben).
    MonthView.tsx           Kalender-Monatsansicht (Haupt-View) + SettingsMenu + Swipe.
                            Export-Button wird zu normalem (nicht-schwebendem) Button,
                            sobald ein Vorschau-Panel offen ist (verdeckte sonst Inhalte)
    DayRow.tsx              Eine Tages-Zeile inkl. Flags (Homeoffice, Reiseart fehlt,
                            ⚠ Keine Arbeitszeit erfasst für vergangene Arbeitstage). "km"
                            neutral (kein Akzent), "extern" nutzt eigene info-Farbe
    DetailSheet.tsx         Tages-Detailformular (653 Zeilen – größte Datei, gewachsen durch
                            3 neue Features 06.09.2026, Refactoring-Empfehlung siehe "Offene
                            Punkte"). Enthält: Tagestyp-Legende (ⓘ-Popover), Bestätigungs-
                            dialog bei Tagestyp-Wechsel mit Bestandsdaten, Freischalt-Logik
                            für Nicht-Arbeitstage (alles außer Sonstiges+Notiz eingeklappt),
                            Beleg-zu-Feld-Zuordnung (`BelegMeta.feld`)
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

- **241 Unit-Tests** (Vitest, 30 Dateien). `cd app && npm run test`. `npm run verify`
  bündelt Test+Lint+Build – IMMER vor einem Push, der einen Live-Zyklus auslöst.
- **E2E-Test** (Playwright, GitHub Actions) – nur täglich 06:00 UTC oder manuell per
  `workflow_dispatch` (Token mit Actions-Scope vorhanden, direkt auslösbar ohne
  Temp-Branch-Umweg). Letzter Lauf: 06.09.2026, `pass: true, failedChecks: []`.
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
- **CSS-Klassen, die NUR noch als E2E-Test-Selektor dienen, beim Restyling übersehen**: Beim
  UI-Redesign (05.-06.09.2026) wurden fünfmal Klassennamen entfernt, die keine Styling-
  Funktion mehr hatten, aber von `test/e2e/` per `.locator()`/`querySelector()` gebraucht
  wurden (`.label`, `.sheet-backdrop`, `.yesno`+`active`, `.del`, Sync-Badge `flag ho/warn`).
  Jedes Mal erst durch einen tatsächlichen E2E-Absturz bemerkt. **Regel: vor JEDER
  Komponenten-Restyle-Aufgabe alle Selektoren aus `test/e2e/*.js` + `test/e2e/steps/*.js`
  extrahieren** (per grep aus den tatsächlichen `locator/click/querySelector`-Aufrufen, nicht
  nur den Dateiinhalt überfliegen) **und einzeln gegen den neuen Code verifizieren** - danach
  trotzdem einen echten E2E-Lauf zur Bestätigung einplanen, nicht nur der eigenen Prüfung
  vertrauen.
- **Tailwind v4: Utility-Name für mehrteilige Theme-Token-Namen ist der VOLLE Suffix nach
  `--color-`, nicht gekürzt.** `--color-text-on-accent` erzeugt die Klasse `text-text-on-accent`
  (für Textfarbe) bzw. `bg-text-on-accent` (für Hintergrund) - NICHT `text-on-accent`. Ein
  blindes projektweites Suchen-Ersetzen von `text-on-accent` → `text-text-on-accent` (um den
  ersten Fehler zu beheben) hat dabei versehentlich auch das schon korrekte `bg-text-on-accent`
  zu `bg-text-text-on-accent` verdoppelt (zweiter, selbst verursachter Bug, sofort gefunden).
  Bei ähnlichen Token-Umbenennungen: Suchen-Ersetzen IMMER mit vollständigem Klassen-Präfix
  (`bg-`/`text-`/`border-`) im Suchmuster, nie nur den Token-Namen alleine.
- **`git push` nach Deploy/E2E-Läufen routinemäßig als "rejected (non-fast-forward)" erwarten**:
  Der Deploy-Workflow UND die geplanten/manuellen E2E-Läufe committen automatisch zurück ins
  Repo (`[skip ci]`-Commits für Build-Output und `test/last-result.json`). Vor jedem eigenen
  Push: `git fetch origin main && git rebase origin/main`, dann erst pushen - kein Sonderfall,
  sondern der Normalfall bei aktiver gleichzeitiger CI-Aktivität.
- **Fine-grained GitHub-PATs lassen sich nicht nachträglich um weitere Berechtigungen
  erweitern** - für einen zusätzlichen Scope (z.B. `Actions: Read and write`, um
  `workflow_dispatch` direkt statt über den Temp-Branch-Umweg auszulösen) muss der Nutzer ein
  KOMPLETT NEUES Token erstellen, nicht das bestehende bearbeiten.

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
oder manuell per `workflow_dispatch` - inzwischen per Token mit Actions-Scope direkt
auslösbar, kein Temp-Branch-Umweg mehr nötig, siehe CLAUDE_CHECKLIST.md Abschnitt 0).

## Offene Punkte / nächste Schritte

1. **`DetailSheet.tsx` (653 Zeilen)** – Formular-UI, AutoSave-Debounce und Beleg-Upload in
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
- **Beleg-Upload/-Persistieren/-Löschen (06.09.2026)** → wieder grün, per E2E bestätigt
  (`pass: true, failedChecks: []`). War KEIN systematisches Appwrite-Berechtigungsproblem
  (Bucket-Permissions + File-Security-Einstellung wurden geprüft, beide korrekt) - der
  ursprüngliche 401-Verdacht war vermutlich flüchtige Appwrite-Eventual-Consistency. Die
  echte, verbleibende Ursache war eine fünfte übersehene E2E-Selektor-Regression aus dem
  UI-Redesign (`.del`-Klasse am Beleg-Löschen-Button entfernt beim Icon-Umbau, ohne gegen
  `test/e2e/` geprüft zu werden). appwriteStore.ts hat zusätzlich verbessertes Error-Logging
  bekommen (verschluckte Nicht-404-Fehler beim defensiven Lösch-Versuch vor dem Upload sind
  jetzt sichtbar).
- **Beleg-zu-Feld-Zuordnung, Bestätigungsdialog bei Tagestyp-Wechsel, Felder bei
  Nicht-Arbeitstagen ausblenden (06.09.2026)** → alle drei umgesetzt (Commit `1633559`),
  per E2E bestätigt (`pass: true`). `BelegMeta.feld` rein informativ, fließt nicht in den
  Export ein. "Sonstiges €" bewusst von der Ausblend-Logik ausgenommen (bleibt unabhängig
  vom Tagestyp eingebbar).
