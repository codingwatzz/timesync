# Projekt: Zeiterfassung & Spesenabrechnung

**Stand: 01.09.2026 (Abend) – geschrieben als Übergabe für einen Chat-Neustart. Jeder Fakt hier
wurde direkt am echten Repo/System verifiziert (frischer Git-Klon, echte Testläufe, direkte
Appwrite-Reads), nicht aus dem Gedächtnis eines Chatverlaufs übernommen.**

## Ziel

Web-App (PWA) zur Erfassung von Arbeitszeiten, Homeoffice-Tagen, Reisekosten und Belegen.
Monatsdaten lassen sich exportieren; die offizielle Excel-Spesenabrechnung des Arbeitgebers
soll künftig automatisiert daraus befüllt werden (dieser letzte Schritt – Export→Excel – ist
**noch nicht gebaut**, siehe "Offene Punkte").

**Live:** https://codingwatzz.github.io/timesync/
**Repo:** https://github.com/codingwatzz/timesync (öffentlich, main-Branch)
**Nutzer:** Raoul Hübner, sqior medical GmbH

## Für Claude: erster Schritt in jeder Sitzung

➡️ **`CLAUDE_CHECKLIST.md`** im selben Repo lesen – verbindliche Arbeitsroutine (schnelle lokale
Prüfung vor Live-Zyklen, Checkliste bei sicherheitsrelevanten Nebenschauplätzen, GitHub-Token-
Hinweise, bekannte Token-Scope-Grenzen). Falls diese Datei nicht als Projekt-Wissensdatei
vorliegt: aus dem Repo-Root laden.

**Diese Übersicht liegt seit 01.09.2026 selbst auch im Repo-Root** (`PROJEKT_UEBERSICHT.md`,
in der Deploy-Workflow-Ausnahmeliste enthalten wie README/CHECKLIST) - direkt dort
aktualisieren (per Commit+Push), statt nur die Projekt-Wissensdatei-Kopie im Chat zu ändern.
Eine als Projekt-Wissensdatei hochgeladene Kopie kann veralten; die Repo-Version ist die
Quelle der Wahrheit.

**Falls kein GitHub-Token im Chat bekannt ist**: aktiv danach fragen, bevor größere Arbeit
beginnt (Details siehe CLAUDE_CHECKLIST.md Abschnitt 0). Ohne Token: nur 60 statt 5000
Anfragen/Stunde, kein Push, keine Appwrite-Storage-Direktprüfung möglich.

## Architektur

Kompletter Rewrite von Vanilla-JS auf **React 19 + TypeScript** (Vite-Build), abgeschlossen am
31.08.2026. Die alte Vanilla-Version liegt als Backup im Branch `legacy-vanilla-backup`.

```
app/                        React-Quellcode
  src/core/                 Reine Logik, 0 DOM-Abhängigkeit (Feiertage, Formeln, Typen)
  src/store/                Storage-Adapter: Appwrite (primär) + IndexedDB (Fallback)
  src/components/           UI: MonthView, DayRow, DetailSheet, ExportView, DiagnosePanel, Toast
  src/hooks/                useMonthEntries, useStore (StoreContext), useToast
  src/lib/                  pdf.ts (Beleg-Konvertierung), exportImport.ts, serviceWorker.ts,
                             pendingReceiptLinks.ts (neu 01.09., siehe unten)
test/
  e2e/                      Modularer E2E-Test (config, utils, navigation, dayHelpers,
                             appwriteDirectCheck, runner.js, steps/*.js)
  e2e.js                    Schlanker Einstiegspunkt (nur Retry-Wrapper)
  offline-test.js           Separater PWA-/Offline-Test
.github/workflows/
  deploy-production.yml     Bei Push auf app/**: npm ci → Test → Lint → Build → Deploy (Root)
  e2e-test.yml              Nach erfolgreichem Deploy (workflow_run) + taeglich 06:00 UTC
```

Root der `main`-Branch **ist** gleichzeitig der gebaute Produktions-Output (GitHub Pages
serviert von main-Root). `app/` enthält den Quellcode, wird bei jedem Deploy neu gebaut und das
Ergebnis ins Root kopiert.

## Datenmodell (TagesEintrag, `app/src/core/types.ts`)

```ts
Wochentyp = 'A' | 'W' | 'F' | 'U' | 'K' | 'G'   // Arbeit/Wochenende/Feiertag/Urlaub/Krank/Gleitfrei
Reiseland = 'Deutschland' | 'Österreich' | 'Schweiz'
Reiseart  = '' | 'Anreisetag' | 'Abreisetag' | 'Abwesenheitstag (>8h)' | 'Abwesenheitstag (24h)'

TagesEintrag {
  typ, typManuell, ho (Homeoffice),
  start, ende, pause,              // erste Schicht
  start2, ende2, pause2,           // ZWEITE Schicht (Feature vom 31.08., z.B. abends nochmal
                                    // gearbeitet), optional/leer wenn ungenutzt
  beschreibung,
  km, transport, hotel, bewirtung, sonstiges,   // alle als String (Formularfelder)
  reiseland, reiseart,
  fr, mi, ab,                      // Frühstück/Mittag/Abend von Firma bezahlt
  receiptIds: string[],
}
```

Belege (`BelegMeta`) liegen als eigene Appwrite-Storage-Datei + Metadaten-Zeile, referenziert
über `receiptIds`. Appwrite-fileId/rowId für einen Beleg = `toAppwriteId('receipt:' + rid)`,
also mit `receipt_`-Präfix (Doppelpunkt wird sanitisiert) - `receiptIds` im Tageseintrag
speichert dagegen die ROHE `rid` ohne Präfix. Wichtig bei jeder Appwrite-Direktprüfung: diese
Umrechnung nicht vergessen, sonst wirkt jeder Beleg fälschlich "unreferenziert".

## Backend (Appwrite Cloud, Frankfurt)

```
Endpoint:    https://fra.cloud.appwrite.io/v1
Project ID:  6a92d8e0002e9b585e39
Database ID: 6a92dad20003b47b4a19
Table ID:    key-value
Bucket ID:   6a92dd0f003962ea7128
```
Berechtigungen: **"Any"-Rolle**, kein Login, kein Zugriffsschutz. Bewusste Entscheidung des
Nutzers, da öffentliches GitHub-Repo + öffentliche Appwrite-Zugangsdaten im Client-Code liegen.
Risiko: theoretisch könnte jemand, der den Quellcode durchsucht, Daten lesen/löschen. Kein
Datenverlust-Backup außer dem App-eigenen JSON-Export.

## Bug gefunden und behoben (01.09.2026): Beleg-Upload gegen Unterbrechung abgesichert

**Symptom (real beim Nutzer aufgetreten):** Ein per Handy-Kamera aufgenommener Beleg (Button
"Foto aufnehmen", `capture="environment"`) landete sicher in Appwrite Storage, war aber am
zugehörigen Tageseintrag nicht verknüpft - eine für den Nutzer unsichtbare Karteileiche.

**Ursache:** `handlePdfUpload`/`handlePhotoUpload` in `DetailSheet.tsx` machen zwei getrennte,
nacheinander abgewartete Appwrite-Schreibvorgänge (1. Beleg hochladen, 2. Tageseintrag mit
neuer `receiptId` aktualisieren). Wird die Seite dazwischen unterbrochen (mobiler Browser
pausiert/lädt neu während der nativen Kamera-App-Übergabe), bleibt Schritt 2 aus.

**Fix:** Neue Datei `app/src/lib/pendingReceiptLinks.ts` - vermerkt die Absicht synchron in
localStorage VOR den beiden Schreibvorgängen, löscht den Vermerk erst nach erfolgreichem
Abschluss beider Schritte. Bleibt ein Vermerk stehen, holt `repairPendingReceiptLinks` (beim
nächsten App-Start über `StoreContext.tsx` eingehängt) die fehlende Verknüpfung automatisch
nach - rein additiv, verändert keine vorhandenen Felder. 6 neue Unit-Tests
(`pendingReceiptLinks.test.ts`). Der konkrete Fall vom 01.09. (Beleg für 2026-08-04) wurde
manuell direkt in Appwrite nachverknüpft und verifiziert.

**Live bestätigt** (Version 1.0.3, Testmonat Dezember 2034 - unberührt von vorheriger
Testverschmutzung): `receiptUploaded: true`, einziger verbleibender Fehlschlag ist der
bekannte, akzeptierte `importWorked`-Flake.

## Zweiter Bug gefunden und behoben (01.09.2026): E2E-Testmonat-Kollision

`navigateToSafeTestMonth()` rundet den gewählten Zufalls-Zeitpunkt immer auf den nächsten
Dezember auf (garantiert Feiertage 25./26.12. für den Test). Der ursprüngliche
MONTHS_FORWARD-Bereich (60-84) ließ dadurch nur **3 erreichbare Ziel-Dezember** zu (z.B.
2031/2032/2033) statt der beabsichtigten "nie zuvor berührte" Vielfalt. Bei mehreren
Testläufen kurz hintereinander (parallele Sitzungen, manuelle Wiederholungen zur Diagnose)
kollidierten die dadurch real auf denselben Tagen und häuften dort Karteileichen an. Fix:
Bereich in `test/e2e/config.js` auf 60-180 erweitert (~10 statt 3 erreichbare Ziel-Dezember).
Betroffene Test-Tage (Dez 2031/2032/2033) wurden bereits einmalig bereinigt (`receiptIds`
geleert).

## Echte Nutzerdaten – Stand

**April bis August 2026 (153 Tage) sind importiert und verifiziert** (direkter Appwrite-Read,
mehrere Stichproben inkl. Split-Schicht-Tage und Gleitfrei-Korrektur bestätigt korrekt).
Quellen: `Arbeitszeit_NEU_Raoul.xlsx` (Stunden/Typ/Homeoffice) zusammengeführt mit den
Original-Spesenabrechnungen (echte Euro-Beträge für Hotel/Transport/Sonstiges, April–Juli).

**Bekannte Lücken/offene Punkte in den echten Daten (Stand nach direkter Appwrite-Prüfung
01.09.2026):**
- **Beide bekannten orphaned Belege sind repariert** (2026-08-04 am 01.09. abends, 2026-08-03
  "Adobe Scan 01.08.2026.pdf" → Eintrag "Deutschlandticket" am 01.09. nachts) - beide direkt in
  Appwrite verknüpft und verifiziert.
- **August 2026**: keine Spesenabrechnungs-Datei existiert(e) für diesen Monat → falls im
  August tatsächlich Reisekosten anfielen, fehlen dafür ggf. Reiseland/Reiseart/Euro-Beträge.
- **Verwaister Test-Beleg (03.08., "Testtag")**: Der ursprüngliche Tageseintrag existiert nicht
  mehr (durch echten Import überschrieben) - kosmetisch, unschädlich, kein dringender Fix.
- **Test-Debris auf Dez 2031/2032/2033**: durch wiederholte manuelle E2E-Diagnoseläufe am
  01.09. entstanden, bereits bereinigt (siehe oben).

## Testing

- **79 Unit-Tests** (Vitest, +6 seit letztem Stand für `pendingReceiptLinks.ts`), lokal in
  ~8-12 Sek. lauffähig: `cd app && npm run test`
- **`npm run verify`** (in `app/`) bündelt Test+Lint+Build – IMMER vor einem Push ausführen,
  der einen Live-Zyklus auslöst.
- **E2E-Test** (Playwright, läuft nur in GitHub Actions – testet gegen einen zufälligen Dezember
  weit in der Zukunft, garantiert Feiertage; Kollisionswahrscheinlichkeit seit 01.09. deutlich
  gesenkt, siehe oben, NIE gegen echte Daten).
- **Offline-/PWA-Test**: separat, prüft Service-Worker-Caching.
- **Täglicher automatischer Lauf** um 06:00 UTC (unabhängig von Code-Änderungen).

**Bekannte, akzeptierte Unschärfe**: `importWorked` schlägt gelegentlich fehl (Appwrite Eventual
Consistency beim Import-Bulk-Schreiben) – kein Crash, alle anderen Prüfungen bestehen
zuverlässig. Bewusst nicht weiter debuggt (Ressourcen-Prinzip).

## Bekannte technische Eigenheiten (nicht erneut als Bug behandeln)

- **Appwrite Eventual Consistency**: Schreibvorgänge können einige Sekunden brauchen, bis sie
  überall konsistent lesbar sind. Großzügige Wartebudgets sind gesetzt.
- **Playwright-Falle**: `page.waitForFunction(fn, options)` ist FALSCH – Options wird sonst als
  Funktionsargument gebunden, Timeout wird ignoriert. Immer `waitForFunction(fn, undefined,
  options)`.
- **Sandbox-Netzwerksperre**: Claudes Bash-Sandbox kann `*.github.io` UND `*.appwrite.io` nicht
  direkt per curl/fetch erreichen (kein "host in allowlist"). App-Status immer über GitHub-API
  (Pages-Build-Status) oder E2E-Testergebnisse prüfen; für direkte Appwrite-Prüfungen einen
  GitHub-Actions-Workflow nutzen (hat Netzwerkzugriff), Ergebnis als Datei zurück ins Repo
  committen und über die Contents-API abholen (siehe CLAUDE_CHECKLIST.md Abschnitt 0).
- **Node-Version**: Workflows brauchen Node 22 (nicht 20) – Vite/jsdom-Kompatibilität.
- **GitHub-Token-Scopes**: ein vom Nutzer geteiltes PAT hat typischerweise KEIN `actions`-Scope
  - `workflow_dispatch`/`rerun`/`variables`/`secrets` per API schlagen mit 403 fehl. Workaround
  über `push`-getriggerte temporäre Workflows (siehe CLAUDE_CHECKLIST.md).
- **Parallele Sitzungen möglich**: der Nutzer kann mehrere Chats gleichzeitig gegen dasselbe
  Repo laufen lassen (am 01.09. real passiert, erkennbar an Commits mit Autor
  `claude@anthropic.com`, die nicht aus der eigenen Sitzung stammen) - kann zu echten
  Appwrite-/Test-Kollisionen führen.

## Wichtige technische Entscheidungen (und warum)

1. **React statt Vanilla-JS** (Migration 31.08.2026): alte Architektur verursachte
   wiederkehrende Bugs bei Formular-Synchronisation sowie eine echte XSS-Lücke, durch React
   strukturell behoben (kein `dangerouslySetInnerHTML` im Code).
2. **Appwrite statt reinem Browser-Storage**: Geräteübergreifender Sync.
3. **Test-Infrastruktur modularisiert** (31.08.): nach demselben Prinzip wie die App aufgeteilt.
4. **pendingReceiptLinks statt atomarer Transaktion** (01.09.): Appwrite bietet keine
   Cross-Resource-Transaktionen zwischen Storage-Datei und Tabellen-Zeile; ein lokal
   persistierter "Absicht-Vermerk" mit Selbstheilung beim nächsten Start ist der pragmatische
   Ersatz.

## Offene Punkte / sinnvolle nächste Schritte

1. **Export→Excel-Automatisierung** ist der ursprüngliche Kern-Anwendungsfall des Projekts und
   noch nicht gebaut (nur der App-interne JSON-Export existiert). Frühere Analyse (vor der
   React-Migration) ergab: chirurgisches XML-Patching der Original-xltx-Datei ist nötig (kein
   Neuaufbau via openpyxl, das verursacht Excel-"Reparatur"-Meldungen). Diese Erkenntnis dürfte
   weiterhin gültig sein, wurde aber im React-Kontext nie neu verifiziert. Die Excel-Vorlage
   (`Spesenabrechnung Vorlage neu ab 01-2026.xltx`) liegt als Projekt-Datei bereit.
2. Appwrite-Berechtigungen: bewusst unverändert gelassen, ggf. bei wachsendem Datenbestand
   nochmal überdenken.
3. Verwaisten Test-Beleg (03.08., "Testtag") bei Gelegenheit manuell in Appwrite Storage
   aufräumen (kein dringender Fix, rein kosmetisch).
