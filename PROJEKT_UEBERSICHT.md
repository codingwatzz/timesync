# Projekt: Zeiterfassung & Spesenabrechnung

**Stand: 04.09.2026, Nachtrag zur Übergabe oben (gleicher Tag, direkte Fortsetzung derselben
Sitzung):** unabhängige Prüfung durchgeführt (frischer Git-Clone, echter `npm run verify`-
Lauf, Code-Review) - keine neuen strukturellen Mängel gefunden, drei verwaiste
Kommentar-Verweise auf das gelöschte Python-Tool bereinigt. Danach die vom Nutzer
vorgemerkte Funktion "Markierung unerfasster Arbeitstage" gebaut (Details siehe "Was NICHT
(mehr) offen ist" unten), committet (`df95b5d`) und live deployed (`80846ea`, per
GitHub-API als `status: built` bestätigt). **Kein echter E2E-Lauf in dieser Sitzung** (nur
lokale Unit-Tests + Live-Deploy-Status-Check) - die 16 neuen Unit-Tests decken die neue
Funktion ab, ein E2E-Lauf wurde bewusst nicht zusätzlich angestoßen (kein Formular-/
Interaktionsverhalten geändert, nur zusätzliche Anzeige-Flags).

**Stand: 04.09.2026 – geschrieben als Übergabe für einen Chat-Neustart (unabhängige Prüfung/
Bewertung der App gewünscht). Jeder Fakt hier wurde direkt am echten Repo/System verifiziert
(frischer Git-Pull, echter Testlauf, echter E2E-Lauf), nicht aus dem Gedächtnis eines
Chatverlaufs übernommen.**

## Ziel

Web-App (PWA) zur Erfassung von Arbeitszeiten, Homeoffice-Tagen, Reisekosten und Belegen.
**Der komplette Monats-Export ist fertig** (das war lange der "Kern-Anwendungsfall, noch
nicht gebaut" - ist es jetzt): ein Button liefert ein .zip mit der ausgefüllten
Spesenabrechnung (.xlsx), allen Belegen als ein PDF, und einer Arbeitszeiten-Übersicht
(.xlsx) - alles direkt im Browser erzeugt, kein Server, kein manuelles Nacharbeiten.

**Live:** https://codingwatzz.github.io/timesync/
**Repo:** https://github.com/codingwatzz/timesync (öffentlich, main-Branch)
**Nutzer:** Raoul Hübner, sqior medical GmbH

## Für Claude: erster Schritt in jeder Sitzung

➡️ **`CLAUDE_CHECKLIST.md`** im selben Repo lesen – verbindliche Arbeitsroutine (lokale
Prüfung vor Live-Zyklen, GitHub-Token-Hinweise, bekannte Fallstricke). Diese Übersicht und
die Checkliste liegen beide im Repo-Root und sind dort die Quelle der Wahrheit (nicht nur
die ggf. veraltete Kopie als Projekt-Wissensdatei) - Änderungen bitte per Commit+Push direkt
im Repo vornehmen.

**Falls kein GitHub-Token bekannt ist**: aktiv danach fragen, bevor größere Arbeit beginnt
(siehe CLAUDE_CHECKLIST.md Abschnitt 0).

## Architektur

React 19 + TypeScript (Vite-Build). Root der `main`-Branch **ist** gleichzeitig der gebaute
Produktions-Output (GitHub Pages serviert von main-Root) - `app/` enthält den Quellcode, wird
bei jedem Deploy neu gebaut und das Ergebnis ins Root kopiert.

```
app/src/
  core/                     Reine Logik, 0 DOM-Abhängigkeit (Feiertage, Formeln, Typen,
                            Formatierung). Fast alles hier ist unit-getestet.
  store/                    Storage-Adapter: Appwrite (primär) + IndexedDB (Fallback)
  components/               UI: MonthView, DayRow, DetailSheet, ExportView, DiagnosePanel,
                            Toast
  hooks/                    useMonthEntries, useStore (StoreContext), useToast, useSwipe
  lib/
    export/                 Die vier Export-Bausteine + gemeinsame Zeilen-Logik:
                            xlsxExport.ts (Spesenabrechnung), receiptMerge.ts (Belege-PDF),
                            arbeitszeitExport.ts (Arbeitszeiten-Übersicht), zipExport.ts
                            (bündelt alle drei), exportZeilen.ts (gemeinsame Zeilen-Auswahl/
                            -Berechnung, JSZip-frei damit sie leicht in die Vorschau-Tabelle
                            eingebunden werden kann ohne den Haupt-Bundle aufzublähen)
    pdf.ts                  Foto -> platzsparendes Graustufen-PDF (Beleg-Aufnahme)
    download.ts             Gemeinsamer Download-Helfer (triggerDownload)
    pendingReceiptLinks.ts  Offline-/Unterbrechungs-Resilienz beim Beleg-Upload
    exportImport.ts         JSON-Import (Backup wiederherstellen)
    serviceWorker.ts        PWA-Caching (network-first für den eigenen Origin)
test/
  e2e/                      Modularer E2E-Test (config, utils, navigation, dayHelpers,
                            appwriteDirectCheck, runner.js, steps/*.js)
  e2e.js                    Schlanker Einstiegspunkt (Retry-Wrapper)
  offline-test.js           Separater PWA-/Offline-Test
.github/workflows/
  deploy-production.yml     Bei Push auf app/**: npm ci -> Test -> Lint -> Build -> Deploy
  e2e-test.yml              NUR manuell (workflow_dispatch) + täglich 06:00 UTC - läuft
                            NICHT mehr bei jedem Deploy (siehe "Testing" unten, Begründung)
tools/spesenabrechnung/
  fetch_month.js/           Reine Node-Diagnose-Skripte (Appwrite-Rohdaten abrufen) -
  fetch_receipts.js         NICHT mehr zum Erzeugen der Spesenabrechnung (das macht die App
                            selbst, siehe app/src/lib/export/). Frühere Python-Werkzeuge
                            (export_xlsx.py/merge_pdf.py/xlsx_to_pdf.py) wurden am
                            04.09.2026 entfernt, siehe "Architektur-Review" unten.
```

## Datenmodell (TagesEintrag, `app/src/core/types.ts`)

```ts
Wochentyp = 'A' | 'W' | 'F' | 'U' | 'K' | 'G'   // Arbeit/Wochenende/Feiertag/Urlaub/Krank/Gleitfrei
Reiseland = 'Deutschland' | 'Österreich' | 'Schweiz'
Reiseart  = '' | 'Anreisetag' | 'Abreisetag' | 'Abwesenheitstag (>8h)' | 'Abwesenheitstag (24h)'
          // '(<8h)' ist eine rein interne App-Markierung, kein Wert der echten Spesenvorlage -
          // muss beim Export wie leer/kein VMA-Anspruch behandelt werden.

TagesEintrag {
  typ, typManuell, ho (Homeoffice),
  start, ende, pause,              // erste Schicht
  start2, ende2, pause2,           // ZWEITE Schicht (z.B. abends nochmal gearbeitet), leer
                                    // wenn ungenutzt
  beschreibung,
  km, transport, hotel, bewirtung, sonstiges,   // alle als String (Formularfelder)
  reiseland, reiseart,
  fr, mi, ab,                      // Frühstück/Mittag/Abend von Firma bezahlt
  receiptIds: string[],
}
```

Belege (`BelegMeta`) liegen als eigene Appwrite-Storage-Datei + Metadaten-Zeile, referenziert
über `receiptIds`.

**Kern-Hilfsfunktionen für "unerfasste Arbeitszeit"** (`app/src/core/entry.ts` /
`formatters.ts`, seit 04.09.2026): `fehltArbeitszeit(entry, typ)` prüft, ob ein Arbeitstag
(typ 'A', auch Homeoffice) weder Start/Ende noch einen Eintrag hat; `istVergangenheit(year,
month, day, referenz?)` prüft, ob ein Datum echt vor "heute" liegt (heute selbst zählt
bewusst noch nicht). Beide sind reine, mit `vi.useFakeTimers()` getestete Funktionen -
Verwendung siehe `DayRow.tsx` (Monatsansicht) und `ExportView.tsx` (Export-Vorschau-Banner).

**Wichtiger Fallstrick:** Appwrite-fileId/rowId für einen Beleg =
`toAppwriteId('receipt:' + rid)`, also **mit `receipt_`-Präfix** (der Doppelpunkt wird zu
einem Unterstrich sanitisiert) - `receiptIds` im Tageseintrag speichert dagegen die ROHE
`rid` OHNE Präfix. Bei jedem direkten Appwrite-Storage-Zugriff (getFile/deleteFile/
createFile) diese Umrechnung nicht vergessen - ein Korrekturversuch am 04.09.2026 landete
dadurch zunächst an einer falschen, verwaisten Datei-ID, während die echte Datei unangetastet
blieb (volle Geschichte in der Git-Historie, Suche nach "receipt_-Praefix").

## Backend (Appwrite Cloud, Frankfurt)

```
Endpoint:    https://fra.cloud.appwrite.io/v1
Project ID:  6a92d8e0002e9b585e39
Database ID: 6a92dad20003b47b4a19
Table ID:    key-value
Bucket ID:   6a92dd0f003962ea7128
```
Berechtigungen: **abgesichert (04.09.2026)** - Tabelle + Bucket stehen auf `user:<Raouls
Appwrite-User-ID>` statt `Any`, Zugriff erfordert einen Login (siehe "Appwrite-Absicherung"
unten). Vorher: "Any"-Rolle, kein Login, kein Zugriffsschutz (bewusste, aber inzwischen
überholte Entscheidung aus der Frühphase). Backup: seit 04.09.2026 eine vierte Datei
(`<Jahr>-<Monat>_Rohdaten-Backup.json`) im ohnehin monatlich vom Nutzer erstellten
Export-.zip - siehe "Backup" unten.

## Appwrite-Absicherung (Login + eingeschränkte Berechtigungen, 04.09.2026)

Vorher konnte theoretisch jeder, der den öffentlichen Quellcode durchsucht und die darin
sichtbaren Appwrite-IDs findet, Daten lesen/löschen ("Any"-Rolle). Das ist jetzt behoben:

- **Echte Appwrite-Nutzer-Session** (Email+Passwort) ist Voraussetzung für JEDEN Zugriff -
  `app/src/components/AuthGate.tsx` zeigt einen Login-Bildschirm, BEVOR überhaupt versucht
  wird, den Store zu laden. Ein Server-seitiger API-Key wäre bei einer reinen Browser-PWA
  KEINE Verbesserung gewesen (läge genauso offen im Bundle) - deshalb echter Login statt Key.
- Tabellen- (`key-value`) und Bucket-Berechtigung (`receipts`) in der Appwrite Console von
  `Any` auf `user:<Raouls User-ID>` umgestellt (volle Rechte: Create/Read/Update/Delete) -
  manueller Konsolen-Schritt, NICHT per Code/API gemacht (dafür wäre ein Appwrite-Admin-Zugang
  nötig gewesen, den Claude nie hatte).
- **Wichtiger Sonderfall (siehe `app/src/hooks/useAuth.ts`):** ein echter Netzwerkfehler bei
  der Session-Prüfung (z.B. echter Offline-Betrieb, kein Internet) wird bewusst NICHT als
  "nicht eingeloggt" gewertet - sonst würde eine bereits eingeloggte Person offline plötzlich
  ausgesperrt. Nur eine echte AppwriteException (z.B. 401 online) löst den Login-Zwang aus.
  Nur so bleibt das bestehende Offline-Verhalten (IndexedDB-Fallback, siehe `createStore.ts`)
  erhalten.
- E2E-Test (`test/e2e/steps/login.js`) und Offline-Test loggen sich jetzt ebenfalls ein
  (Zugangsdaten aus den GitHub-Secrets `APPWRITE_EMAIL`/`APPWRITE_PASSWORD`).
- **Live verifiziert** (nicht nur Unit-getestet): zwei echte E2E-Läufe über den
  temporären-Branch-Workaround, einmal direkt nach dem Login-Deploy (noch mit "Any"), einmal
  NACH der Berechtigungs-Umstellung (mit `user:<id>`) - beide `pass: true`, alle 16
  kritischen Prüfungen bestanden, inklusive Beleg-Upload/-Persistenz/-Löschung (Bucket) und
  Import.

## Zahnrad-Menü + In-App-Vorschau (05.09.2026)

Nutzerwunsch: Import/Diagnose aus der Monatsansicht in ein Menü verschieben, plus eine
ausklappbare Vorschau auf Spesenabrechnung/Arbeitszeiten OHNE Datei-Erzeugung.

- **Zahnrad ⚙ oben links** (`SettingsMenu.tsx`) statt Drei-Linien-Menü - bewusste Entscheidung,
  da diese App nur EINE Hauptansicht hat (Kalender), ein Hamburger-Menü würde fälschlich
  mehrere Seiten suggerieren. Enthält: Importieren, Diagnose. "Monat exportieren" bleibt
  bewusst ein eigener, gut sichtbarer Button (monatlich gebraucht, im Gegensatz zu den beiden
  anderen).
- **`core/arbeitszeit.ts`** (neu): reine Berechnungslogik aus `arbeitszeitExport.ts`
  herausgelöst - Excel-Export UND die neue In-App-Vorschau nutzen jetzt exakt dieselbe
  Berechnung (keine zwei Implementierungen, die hätten auseinanderlaufen können).
- **`MonthPreviews.tsx`**: ausklappbare Akkordeon-Sektion direkt in der Monatsansicht
  ("Spesenabrechnung-Vorschau" / "Arbeitszeiten-Vorschau") - rein synchrone Berechnung aus den
  ohnehin geladenen `entries`, kein Store-/Netzwerk-Zugriff, keine Datei wird erzeugt.
- `DiagnosePanel.tsx` ist jetzt eine von außen gesteuerte Komponente (open/onClose-Props),
  kein eigener schwebender Auslöse-Button mehr.
- E2E-Test angepasst: Diagnose ist jetzt hinter `#settingsBtn` → Zahnrad-Menü → "Diagnose"
  erreichbar, nicht mehr über das inzwischen entfernte `#debugBtn`.

## Der Monats-Export (fertig, siehe `app/src/lib/export/`)

Button "Monat exportieren" -> Vorschau-Tabelle (kosten-/reiserelevante Tage) -> ein Klick auf
"Export herunterladen (.zip)" liefert:

1. **`<Jahr>-<Monat>_Spesenabrechnung-Raoul.xlsx`** - die offizielle Vorlage
   (`app/public/Spesenabrechnung-Vorlage.xltx`), chirurgisch per XML-Patching befüllt
   (JSZip) - Dropdown-Validierungen, Formeln und Formatierung der Vorlage bleiben
   unversehrt. Wird vom Nutzer selbst in Excel/Sheets geöffnet und bei Bedarf als PDF
   exportiert (2 Klicks, garantiert pixelgenau, da eine echte Tabellenkalkulation rendert -
   kein Rendering-Nachbau im Browser nötig).
2. **`<Jahr>-<Monat>_Belege-Spesenabrechnung-Raoul.pdf`** - alle Belege des Monats in
   Datumsreihenfolge zu einem PDF zusammengeführt (pdf-lib). Fotos werden bereits bei der
   Aufnahme in Graustufen + sanfter Kontraststreckung umgewandelt (weniger Druckertinte),
   siehe `app/src/lib/pdf.ts`.
3. **`<Jahr>-<Monat>_Arbeitszeiten-Raoul.xlsx`** - IST/SOLL(6:24h)/EXTRA pro Arbeitstag,
   Wochensummen, GESAMT-Zeile mit %-Abweichung, Homeoffice-Quote, Anzahl Arbeits-/Urlaubs-/
   Kranheits-/Gleitfreitage. Optik vom Nutzer selbst final abgenommen (04.09.2026) - **dieser
   Stand ist verbindlich, nicht ohne neuen Anlass verändern.**
4. **`<Jahr>-<Monat>_Rohdaten-Backup.json`** (seit 04.09.2026, `backupExport.ts`) - ALLE
   Tageseinträge des Monats (nicht nur die kosten-/reiserelevanten wie in Punkt 1) plus alle
   referenzierten Belege als echte Datei-Inhalte (Base64), nicht nur Metadaten. Dient als
   Backup - siehe Abschnitt "Backup" unten für Hintergrund und bekannte Einschränkung
   (aktuell kein automatischer Restore aus dieser Datei).

Alle vier Bausteine sind einzeln unit-getestet; `zipExport.ts` fügt nur zusammen, ohne eigene
Geschäftslogik.

## Backup

**Entscheidung 04.09.2026 (nach zwei gescheiterten automatisierten Anläufen, siehe
Git-Historie):** Statt eines vollautomatischen GitHub-Actions-Backups (erst Google-Drive-
Service-Account versucht - scheiterte an einer harten Plattform-Grenze, Service-Accounts
haben bei privaten/nicht-Workspace-Google-Konten keinen eigenen Speicherplatz und können
grundsätzlich keine Dateien hochladen; dann Email-Versand vorbereitet) fällt das Backup jetzt
einfach als vierte Datei im ohnehin **monatlich vom Nutzer selbst durchgeführten
Monats-Export** mit ab (`<Jahr>-<Monat>_Rohdaten-Backup.json`, siehe oben). Vorteil: keine
externe Infrastruktur, keine Secrets, keine neue Angriffsfläche im öffentlichen Repo - passt
zur bestehenden "alles läuft im Browser"-Architektur. Nachteil, bewusst in Kauf genommen: die
Zuverlässigkeit hängt am menschlichen Gewohnheits-Export, nicht an einer Automatik - der
Nutzer macht diesen Export aber ohnehin schon jeden Monat.

**Wichtige Einschränkung:** Es gibt aktuell KEINEN Ein-Klick-Restore aus dieser Backup-Datei.
Der bestehende JSON-Import (`lib/exportImport.ts`) versteht das Backup-Format nicht (er
erwartet ein einfaches `entries`-Array ohne Belege) und verwirft beim Import ohnehin jegliche
`receiptIds`. Die Backup-Datei ist aktuell ein reines Sicherungs-Archiv zum Nachschauen/
manuellen Wiederherstellen im Notfall. Eine echte Restore-Funktion wäre ein sinnvoller,
klar abgegrenzter nächster Schritt, falls gewünscht (siehe "Offene Punkte" unten).

**Aufräumen (nicht sicherheitskritisch, aber unnötig):** Für den verworfenen
GitHub-Actions-Anlauf wurden ein Appwrite-API-Key ("backup-timesync", rein lesend, läuft
01.01.2029 ab) und 3 GitHub-Secrets (`APPWRITE_BACKUP_API_KEY`, `GDRIVE_SERVICE_ACCOUNT_JSON`,
`GDRIVE_BACKUP_FOLDER_ID`) angelegt - die referenziert jetzt kein Workflow mehr. Kein akutes
Risiko (rein lesend, kein Löschen möglich), aber bei Gelegenheit aufräumen: den API-Key in der
Appwrite Console widerrufen, die 3 Secrets in GitHub löschen.

## Testing

- **225 Unit-Tests** (Vitest, 28 Dateien, Stand 05.09.2026 nach Zahnrad-Menü + Vorschau)
  , lokal in ~20-25 Sek. lauffähig: `cd app && npm run test`. `npm run verify` bündelt
  Test+Lint+Build – IMMER vor einem Push, der einen Live-Zyklus auslöst.
- **E2E-Test** (Playwright, GitHub Actions) - läuft **NICHT mehr bei jedem Deploy**
  (bewusste Entscheidung 02.09.2026: kostet mehrere Minuten Actions-Zeit + Wartezeit pro
  Push, unverhältnismäßig teuer für die meisten Änderungen). Läuft nur noch: täglich
  06:00 UTC, oder manuell über die GitHub-Actions-UI ("Run workflow" - Claudes Token hat
  KEIN `actions`-Scope, `workflow_dispatch` per API schlägt mit 403 fehl; Workaround über
  einen push-getriggerten temporären Branch, siehe CLAUDE_CHECKLIST.md).
- **04.09.2026, Architektur-Review:** E2E wurde tatsächlich ausgeführt (nicht nur per Code-
  Review geprüft) und dabei ein echter, damals bestehender Bug gefunden: `#f_pause` ist
  inzwischen ein `<select>`-Dropdown, der Test versuchte noch `page.fill()` darauf (nur für
  Text-Felder gültig) - behoben (`page.selectOption()`). Ein redundanter Prüfschritt
  (Wochenend-/Feiertags-Erkennung, bereits vollständig durch Unit-Tests abgedeckt) wurde
  entfernt. Danach: **vollständiger E2E-Lauf grün, alle 16 kritischen Prüfungen bestanden.**
- **`importWorked`-Flakigkeit robuster gemacht (04.09.2026, selbe Sitzung wie oben):** war
  bisher "bekannte, akzeptierte Unschärfe" (schlug gelegentlich fehl wegen Appwrite Eventual
  Consistency, ohne Crash, alle anderen Prüfungen bestanden zuverlässig) - da dieser Check in
  `runner.js::CRITICAL_CHECKS` steht, ließ ein Fehlschlag hier den GESAMTEN Lauf rot
  erscheinen, obwohl nichts wirklich kaputt war. Fix: Wartebudget deutlich erhöht (10 Versuche
  statt 6, Backoff-Deckel 20s statt 12s, ~140s statt ~42s Gesamtbudget) UND ein direkter
  Appwrite-Read (`appwriteDirectCheck.js`) als Diagnose ab dem 3. Versuch - unterscheidet klar
  "Daten sind schon da, UI hinkt nur hinterher" (weiter warten lohnt sich) von "Daten wirklich
  noch nicht da" (potenziell echtes Problem). Ändert NICHT das Pass/Fail-Kriterium selbst
  (bleibt an der UI-Sicht), verbessert nur Diagnose + senkt die Falsch-Fehlschlag-Rate. Noch
  nicht durch einen echten E2E-Lauf bestätigt (nächster planmäßiger Lauf: 05.09.2026 06:00
  UTC) - falls der wider Erwarten noch fehlschlägt, direkt ins Log schauen (die neue Diagnose
  sagt jetzt klar, ob es Appwrite-Verzögerung oder ein echter UI-Bug war).
- **Offline-/PWA-Test**: separat (`test/offline-test.js`), prüft Service-Worker-Caching.

## Architektur-Review (04.09.2026, auf Nutzerwunsch)

Systematischer Durchgang mit dem Ziel "modern gecoded, modular aufgebaut, klare Trennung für
einfache Updates/Tests/Erweiterung". Ergebnis:

- **Vier fast identische `download*`-Funktionen** (in xlsxExport/receiptMerge/
  arbeitszeitExport/zipExport, jeweils dieselbe createObjectURL+`<a>`+click+revoke-Logik) zu
  einem gemeinsamen `lib/download.ts::triggerDownload()` zusammengeführt. Drei lokale
  `pad2()`-Redefinitionen entfernt (nutzen jetzt die vorhandene `core/formatters.ts::pad()`).
- Drei dadurch tot gewordene Einzel-Download-Funktionen entfernt (nach dem ZIP-Umbau nie
  mehr aufgerufen).
- Die fünf zusammengehörigen Export-Bausteine nach `lib/export/` gruppiert (lagen vorher im
  selben Ordner wie funktional unabhängige Dinge wie Foto-Aufnahme/Service-Worker).
- **Redundantes Python-Werkzeug entfernt**: `tools/spesenabrechnung/export_xlsx.py`,
  `merge_pdf.py`, `xlsx_to_pdf.py` + `requirements.txt` - erzeugten denselben Export manuell,
  bevor die App das selbst konnte. `fetch_month.js`/`fetch_receipts.js` (reines Node, keine
  Python-Abhängigkeit) bleiben als Appwrite-Diagnose-Werkzeuge.
- Test-Helfer `leererEintrag()`/`eintrag()` war in 4 Testdateien mit leicht
  auseinandergelaufenen Defaults dupliziert - jetzt einmal zentral
  (`lib/export/__tests__/testFixtures.ts`).

**Bewusst zurückgestellt, nicht angefasst:**
- **`DetailSheet.tsx` (409 Zeilen, größte Datei der App)** - vermischt Formular-UI,
  Auto-Save-Debounce-Logik und Beleg-Upload-Handling in einer Komponente. Aufteilung in
  eigene Hooks (`useAutoSave`, `useReceiptUpload` o.ä.) wäre sauberer, aber echtes
  Refactoring-Risiko - **Empfehlung: angehen, sobald ohnehin inhaltlich an dieser Datei
  gearbeitet wird** (z.B. neues Formularfeld), nicht "auf Vorrat". Falls das länger nicht
  passiert: als eigene, fokussierte Aufgabe zu Beginn eines frischen Threads (volle
  Aufmerksamkeit, bestehende 20 Tests als Sicherheitsnetz), nicht am Ende einer langen
  Sitzung.

## Bekannte technische Eigenheiten (nicht erneut als Bug behandeln)

- **Appwrite Eventual Consistency**: Schreibvorgänge können einige Sekunden brauchen, bis sie
  überall konsistent lesbar sind. Großzügige Wartebudgets sind gesetzt.
- **Appwrite Storage-Downloads laufen hinter einem CDN (Varnish)** - `{cache: 'no-store'}`
  beim `fetch()` reicht NICHT, um eine geänderte Datei unter derselben URL zuverlässig frisch
  zu bekommen (Varnish cached serverseitig, unabhängig vom Client-Cache-Control). Bei
  wiederholtem Abruf derselben Datei-URL einen Cache-Buster-Query-Parameter anhängen
  (`&_cb=${Date.now()}`) - bereits so implementiert in `appwriteStore.ts`.
- **Playwright-Falle**: `page.waitForFunction(fn, options)` ist FALSCH – Options wird sonst
  als Funktionsargument gebunden, Timeout wird ignoriert. Immer `waitForFunction(fn,
  undefined, options)`.
- **Sandbox-Netzwerksperre**: Claudes Bash-Sandbox kann `*.github.io` UND `*.appwrite.io`
  nicht direkt per curl/fetch erreichen. App-Status immer über GitHub-API (Pages-Build-
  Status) oder E2E-Testergebnisse prüfen; für direkte Appwrite-Prüfungen einen GitHub-
  Actions-Workflow nutzen (hat Netzwerkzugriff), Ergebnis als Datei zurück ins Repo committen
  und über die Contents-/Git-Blobs-API abholen (siehe CLAUDE_CHECKLIST.md Abschnitt 0).
- **GitHub Actions Log-Download** (`.../actions/jobs/<id>/logs`) leitet auf eine Azure-Blob-
  URL um, die ebenfalls nicht in der Sandbox-Allowlist ist - Workaround: Log-Datei im
  Workflow selbst committen lassen (`git add`+`push` als letzter Schritt), dann per Contents-
  API abholen.
- **Node-Version**: Workflows brauchen Node 22 (nicht 20) – Vite/jsdom-Kompatibilität.
- **GitHub-Token-Scopes**: das vom Nutzer geteilte PAT hat KEIN `actions`-Scope -
  `workflow_dispatch`/`rerun`/`variables`/`secrets` per API schlagen mit 403 fehl. Workaround
  über `push`-getriggerte temporäre Workflows (siehe CLAUDE_CHECKLIST.md), danach den
  temporären Branch per API wieder löschen.
- **Parallele Sitzungen möglich**: der Nutzer kann mehrere Chats gleichzeitig gegen dasselbe
  Repo laufen lassen (schon einmal real passiert, erkennbar an Commits mit Autor
  `claude@anthropic.com`, die nicht aus der eigenen Sitzung stammen) - kann zu echten
  Appwrite-/Test-Kollisionen führen.

## Offene Punkte / nächste Schritte

1. `DetailSheet.tsx`-Aufteilung (siehe Architektur-Review oben) - bewusst zurückgestellt,
   Timing-Empfehlung siehe dort.
2. ~~Appwrite-Berechtigungen ("Any"-Rolle)~~ - **erledigt 04.09.2026**, siehe "Appwrite-
   Absicherung" oben.
3. ~~Monatliches Backup~~ - **erledigt 04.09.2026**, siehe Abschnitt "Backup" oben (vierte
   Datei im Monats-Export). Optional als Ausbau denkbar, aber nicht gefordert: ein echter
   Ein-Klick-Restore aus `_Rohdaten-Backup.json` (aktuell nur manuell nutzbar, siehe dort).
4. Aufräumen: ungenutzten Appwrite-API-Key "backup-timesync" + 3 GitHub-Secrets vom
   verworfenen Backup-Anlauf entfernen (siehe Abschnitt "Backup" oben, Details dort - kein
   akutes Risiko, nur unnötig).
5. August 2026: keine Original-Spesenabrechnungs-Datei für diesen Monat existiert(e) als
   Abgleichsquelle - die App-Daten für August wurden direkt erfasst, nicht gegen eine externe
   Quelle verifiziert (anders als April-Juli). Kein akuter Handlungsbedarf, nur zur
   Einordnung falls Abweichungen auffallen sollten.

## Was NICHT (mehr) offen ist, zur Vermeidung von doppelter Arbeit

- Export→Excel/PDF/Arbeitszeiten-Automatisierung: **fertig**, siehe oben.
- Ein Browser-PDF-Button für die Spesenabrechnung selbst (zusätzlich zur .xlsx): bewusst
  NICHT gebaut - der Nutzer exportiert bei Bedarf selbst über Excel/Sheets (2 Klicks,
  garantiert pixelgenau). Nur auf expliziten neuen Wunsch wieder aufgreifen, dann mit dem
  Wissen, dass ein Browser-Nachbau (ohne LibreOffice/Server) das gleiche Risiko wie beim
  ursprünglichen Anlauf trägt (nicht 100% identisch zur echten Vorlage).
- **Markierung vergangener Arbeitstage ohne erfasste Arbeitszeit: fertig** (04.09.2026,
  Commit `df95b5d`, live seit Deploy `80846ea`). Kriterien wurden vom Nutzer geklärt statt
  geraten: "ohne Arbeitszeit" = kein Start/Ende gesetzt (`core/entry.ts::fehltArbeitszeit`,
  arbeitszeitMinuten()===0 ODER gar kein Eintrag - gilt für jeden Tag mit typ 'A', auch
  Homeoffice); "zurückliegend" = beliebig weit in die Vergangenheit, kein festes Zeitfenster
  (`core/formatters.ts::istVergangenheit`, "heute" selbst zählt bewusst noch nicht als
  vergessen); Sichtbarkeit = Monatsansicht (neues `⚠ Keine Arbeitszeit erfasst`-Flag in
  DayRow.tsx, wiederverwendet den bestehenden `.flag.warn`-Stil) + Export-Vorschau (neuer
  warn-banner in ExportView.tsx, listet alle betroffenen Tage des Monats unabhängig von der
  kosten-/reiserelevanten Zeilenauswahl auf). Bewusst KEIN globaler Badge außerhalb dieser
  beiden Stellen (Nutzerentscheidung) - die Monats-für-Monat-Ladearchitektur
  (`useMonthEntries`) musste dafür nicht angetastet werden. 16 neue Unit-Tests, alle mit
  `vi.useFakeTimers()` (deterministisch, unabhängig vom echten Testlauf-Datum).
