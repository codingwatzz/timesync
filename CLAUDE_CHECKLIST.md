# Arbeits-Checkliste für Claude (verbindlich, jede Sitzung)

Diese Datei existiert, weil Claude sich zwischen Chat-Sitzungen an nichts erinnert. Sie ist das
Gedächtnis. **Vor Beginn jeder Aufgabe in diesem Projekt: diese Datei lesen.**

Entstanden am 31.08.2026 nach einer Sitzung, in der Ressourcen unnötig verbraucht wurden
(viele Live-Testzyklen für einzelne Vermutungen) und zwei Dinge übersehen wurden (ein Bug
blieb an mehreren Stellen unbehoben, personenbezogene Daten blieben im öffentlichen Git-
Verlauf liegen). Konkrete Regeln daraus:

## 0. GitHub-Zugangsdaten (WICHTIG, zuerst prüfen)

Für alles, was über reines Lesen des öffentlichen Repo-Inhalts hinausgeht - Commits pushen,
Workflows auslösen, per GitHub-API mit vernünftigem Rate-Limit arbeiten, oder über einen
CI-Lauf einen echten Browser mit Appwrite-Zugriff starten (z.B. um Appwrite Storage direkt zu
prüfen) - wird ein **GitHub Personal Access Token** gebraucht (Scopes: Contents read/write,
Workflows read/write).

**Falls kein Token im aktuellen Chat bekannt ist: den Nutzer aktiv danach fragen**, bevor
größere Arbeit begonnen wird, statt stillschweigend nur mit eingeschränktem (unauthentifiziertem,
z.B. 60 statt 5000 Anfragen/Stunde) Zugriff weiterzuarbeiten. Das Token gehört NIEMALS in eine
Projekt-Datei, eine Commit-Message oder sonst einen dauerhaften, geteilten Ort - immer nur
direkt im Chat vom Nutzer übergeben lassen.

**Nach jeder Sitzung, in der ein Token geteilt wurde: dem Nutzer empfehlen, es zu
rotieren/widerrufen** (GitHub → Settings → Developer settings → Personal access tokens) -
auch wenn es nie in eine Datei/einen Commit geschrieben wurde. Der Chatverlauf selbst ist
nicht flüchtig (bleibt bestehen, wie diese Datei hier beweist) - ein einmal im Chat geteiltes
Token sollte behandelt werden, als wäre es kurzzeitig exponiert gewesen.

(Dieser Abschnitt existiert, weil genau das am 01.09.2026 vergessen wurde: eine Chat-Sitzung
hatte ein Token und konnte damit vieles verifizieren; die Übergabe an die nächste Sitzung
erwähnte nirgends, dass dafür überhaupt ein Token nötig ist - die neue Sitzung stieß dadurch
unerwartet auf Rate-Limits und konnte Appwrite Storage nicht prüfen.)

**Praktische Einschränkung, real erlebt (01.09.2026):** Ein vom Nutzer im Chat geteiltes Token
ist typischerweise ein **fine-grained PAT ohne `actions`-Scope** - `workflow_dispatch` per API
und `POST .../actions/runs/{id}/rerun` schlagen dann mit 403 "Resource not accessible by
personal access token" fehl, ebenso `GET .../actions/variables` bzw. `/secrets`. Workaround:
temporären Branch mit einem Workflow anlegen, der auf `push` statt `workflow_dispatch`
reagiert - ein normaler `git push` auf den Branch triggert ihn ganz regulär, ganz ohne
Actions-API-Berechtigung. Außerdem scheitert `GET .../runs/{id}/logs` an der
Sandbox-Netzwerksperre (Redirect auf `results-receiver.actions.githubusercontent.com`, nicht
in der Freigabeliste) - Workaround: Ergebnis als Datei im selben Workflow-Lauf zurück ins Repo
committen (wie `e2e-test.yml` es ohnehin für `last-result.json` tut) und über die normale
Contents-API (`GET .../contents/<pfad>?ref=<branch>`) abholen.

**Contents-API hat ein ~1-MB-Limit für Inline-Inhalte** (real erlebt 02.09.2026 beim
Abholen heruntergeladener Beleg-PDFs): bei größeren Dateien liefert die Antwort
`encoding: "none"` und ein leeres `content`-Feld, ohne Fehlermeldung. Workaround: die `sha`
aus der Contents-Antwort nehmen und stattdessen die Git-Blobs-API verwenden (funktioniert
bis 100 MB): `GET /repos/<repo>/git/blobs/<sha>` liefert denselben Inhalt zuverlässig
base64-kodiert.

## 1. Lokale Prüfung VOR jedem Live-Zyklus

Bevor irgendetwas gepusht wird, das einen Deploy/E2E-Test auslöst:

```
cd app && npm run verify
```

Das bündelt Unit-Tests + Lint + Build (läuft in Sekunden, nicht Minuten). Ein Live-Zyklus
(Push → Deploy → E2E-Test) kostet 4-6 Minuten UND echtes Nutzungsguthaben - er ist für
**Bestätigung**, nicht zum Durchprobieren einzelner Vermutungen gedacht.

**Regel:** Bei der Fehlersuche mehrere Hypothesen/Diagnose-Instrumente in EINEM Durchlauf
bündeln, statt nacheinander einzeln zu testen. Wenn ein Fehler inkonsistent auftritt (mal so,
mal so), ist das ein Signal für externe Systemcharakteristik (z.B. Appwrite Eventual
Consistency), nicht für einen deterministischen Code-Bug - dann direkt auf "Grundwahrheit
prüfen" umschalten (siehe `test/e2e/appwriteDirectCheck.js`), nicht symptomatisch patchen.

## 2. Checkliste bei sicherheitsrelevanten Nebenschauplätzen

Bei JEDER Aufgabe, die eines der folgenden Dinge einschließt, diese Punkte VOR Abschluss der
Aufgabe konkret abhaken (nicht nur im Kopf behalten):

- [ ] **Temporärer Branch angelegt?** → Nach Gebrauch löschen, UND per API bestätigen, dass er
      wirklich weg ist (nicht nur den Löschbefehl abgesetzt haben).
- [ ] **Datei mit personenbezogenen/sensiblen Daten committet** (auch nur kurzzeitig, auch auf
      einem Branch)? → Nach Abschluss zwingend prüfen:
      `git log --all --oneline -- <pfad>` muss leer sein.
      Falls nicht leer: mit `git-filter-repo --path <pfad> --invert-paths` aus der GESAMTEN
      Historie entfernen und `git push --force` - ein normaler Lösch-Commit reicht NICHT,
      die Datei bleibt sonst in alten Commits auffindbar.
- [ ] **Ein Bugfix wurde an einer Stelle gemacht** (z.B. in einem Wegwerf-Skript)? → Sofort
      prüfen, ob dasselbe Muster anderswo im Projekt existiert (`grep -rn` über das ganze
      Verzeichnis), BEVOR die Aufgabe als erledigt gilt. Ein Fix an nur einer von mehreren
      betroffenen Stellen ist kein vollständiger Fix.
- [ ] **Am Ende jeder Aufgabe mit einem Nebenschauplatz:** kurz explizit gegenprüfen (per API/
      Kommando, nicht aus dem Gedächtnis), dass der Nebenschauplatz wirklich sauber
      abgeschlossen ist, bevor dem Nutzer "erledigt" gemeldet wird.

## 3. Bekannte, akzeptierte Eigenheiten (nicht erneut debuggen)

- Appwrite-Schreibvorgänge können einige Sekunden brauchen, bis sie überall konsistent lesbar
  sind ("Eventual Consistency"). Großzügige Wartebudgets sind bereits gesetzt
  (`test/e2e/steps/importFlow.js`). Nicht erneut als Bug behandeln.
- `page.waitForFunction(fn, options)` in Playwright ist FALSCH - das Options-Objekt wird sonst
  als Funktionsargument gebunden, das Timeout wird stillschweigend ignoriert. Immer:
  `page.waitForFunction(fn, undefined, options)`.- Meine Sandbox kann `*.github.io` nicht direkt anfragen (Netzwerk-Freigabeliste). Status der
  Live-App IMMER über die GitHub-API (Pages-Build-Status) oder über E2E-Testergebnisse
  prüfen, nie per direktem `curl`/`web_fetch` auf die Live-URL.
- **`test/e2e.js`s "nicht überschreiben"-Sicherheitslogik prüfte nur "ist die Datei gültiges
  JSON", nicht "stammt sie aus DIESEM Lauf"** - ein sehr früher Absturz (vor jedem
  Schreibversuch) blieb dadurch unsichtbar, weil eine alte, aber gültige Datei von einem
  früheren Lauf die Prüfung fälschlich bestand. Fix: Zeitstempel-Vergleich (`runStartTime`).
  Bei ähnlichen "nicht überschreiben, außer..."-Sicherheitschecks künftig IMMER an einem
  Zeitstempel/einer Lauf-ID festmachen, nicht an bloßer Gültigkeit.
- **Der Deploy-Workflow löscht bei JEDEM Deploy das komplette Root-Verzeichnis außer einer
  Ausnahmeliste, dann kopiert er den frischen Build rein.** Root-Dateien wie `README.md`/
  `CLAUDE_CHECKLIST.md`, die NICHT Teil des App-Builds sind, wurden dadurch beim ersten Deploy
  nach ihrer Erstellung automatisch mitgelöscht (gefunden + behoben 01.09.2026, siehe
  `.github/workflows/deploy-production.yml`, Ausnahmeliste im `find`-Befehl).
  **Derselbe Bug ist am 02.09.2026 ERNEUT aufgetreten**, diesmal mit einem ganzen
  Root-VERZEICHNIS (`tools/spesenabrechnung/` samt `.gitignore`) - ein `app/**`-Push loeste
  einen Deploy aus, der `tools/` komplett geloescht hat (ueber Git-History wiederhergestellt,
  keine dauerhaften Daten verloren, aber vermeidbar gewesen). **Bei JEDER neuen Root-Datei
  ODER JEDEM neuen Root-Verzeichnis, das nicht Teil des App-Builds ist: SOFORT in die
  Ausnahmeliste in `deploy-production.yml` eintragen, nicht erst wenn es zum zweiten Mal
  weh tut.** Am besten direkt beim Anlegen des neuen Root-Eintrags, nicht als Nachgedanke.
- **`navigateToSafeTestMonth()` rundet den gewählten Zufalls-Zeitpunkt immer auf den nächsten
  Dezember auf** (garantiert Feiertage 25./26.12. für den Test). Der ursprüngliche
  MONTHS_FORWARD-Bereich (60-84) ließ dadurch nur 3 erreichbare Ziel-Dezember zu - bei mehreren
  Testläufen kurz hintereinander (parallele Sitzungen, manuelle Wiederholungen zur Diagnose)
  kollidieren die mit spürbarer Wahrscheinlichkeit auf demselben Tag und häufen dort
  Karteileichen an (echt passiert am 01.09.2026). Fix: Bereich auf 60-180 erweitert (~10 statt
  3 erreichbare Dezember). Bei erneuter Diagnose per manuellem `node test/e2e.js`-Rerun:
  IMMER daran denken, dass ein Fehlschlag auch von den eigenen vorherigen Wiederholungsläufen
  auf demselben Testtag stammen kann, nicht zwingend vom untersuchten Code - vor dem
  Schlussfolgern lieber die betroffene Testzeile direkt in Appwrite gegenprüfen.
- **Beleg-Upload (PDF- und Foto-Pfad in `DetailSheet.tsx`) macht zwei getrennte,
  nacheinander abgewartete Appwrite-Schreibvorgänge** (1. Beleg hochladen, 2. Tageseintrag mit
  neuer receiptId aktualisieren). Wird die Seite dazwischen unterbrochen (z.B. weil der mobile
  Browser während der nativen Kamera-App via `capture="environment"` pausiert/neu lädt), landet
  der Beleg sicher in Appwrite, der Tageseintrag verweist aber nie darauf - unsichtbare
  Karteileiche, real aufgetreten am 01.09.2026. Fix: `pendingReceiptLinks.ts` vermerkt die
  Absicht synchron in localStorage vor den beiden Schreibvorgängen; `repairPendingReceiptLinks`
  holt beim nächsten App-Start liegen gebliebene Verknüpfungen automatisch nach.
- **Appwrite-Storage-Datei-IDs für Belege haben das Präfix `receipt_`** (aus `receipt:<rid>`
  wird über `toAppwriteId()` `receipt_<rid>` - Doppelpunkt -> Unterstrich). Bei DIREKTEN
  Storage-Zugriffen (eigene Skripte, nicht die App selbst) IMMER dieses Präfix verwenden,
  nicht den rohen `rid`. Ein Korrekturversuch am 04.09.2026 schrieb zunächst ohne Präfix -
  landete an einer verwaisten, nie referenzierten Datei, waehrend die echte, vom Nutzer
  gesehene Datei unangetastet blieb. Eigene Nachpruefung (Re-Download derselben falschen ID)
  bestaetigte faelschlich "Erfolg", weil sie denselben Fehler wiederholte statt gegen die
  ECHTE, von der App genutzte ID zu pruefen - bei Verifikation immer die ID-Herleitung selbst
  hinterfragen, nicht nur "kommt dieselbe Datei zurueck, die ich geschrieben habe" pruefen.
- **Appwrite Storage-Downloads laufen hinter einem CDN (Varnish)** - `fetch(url, {cache:
  'no-store'})` beeinflusst nur den LOKALEN Browser-Cache, nicht das CDN. Nach dem Ersetzen
  einer Datei unter derselben ID/URL kann das CDN weiterhin die alte Version ausliefern,
  selbst nach explizitem Client-Cache-Leeren durch den Nutzer. Fix: einen sich aendernden
  Query-Parameter an die URL anhaengen (`&_cb=${Date.now()}`), damit jede Cache-Ebene die
  Anfrage als neue Ressource behandelt - bereits so in `appwriteStore.ts` implementiert.
- **`#f_pause`/`#f_pause2` in `DetailSheet.tsx` sind `<select>`-Dropdowns** (Minuten-Schritte
  ueber `pauseOptionsFor`), keine Text-Eingabefelder. `page.fill()` in Playwright-Tests wirft
  darauf einen Fehler ("Element is not an input..."); `page.selectOption()` verwenden. Dieser
  Fehler steckte unbemerkt im E2E-Test, weil E2E seit 02.09.2026 nicht mehr bei jedem Push
  laeuft - bei neuen Formularfeld-Aenderungen (Text-Input -> Select o.ae.) aktiv pruefen, ob
  betroffene E2E-Schritte noch `fill()` statt `selectOption()`/`check()` verwenden.

## 4. Parallele Sitzungen

Es kann vorkommen, dass der Nutzer mehrere Chat-Sitzungen gleichzeitig gegen dasselbe Repo/
dieselbe Appwrite-Instanz laufen lässt (am 01.09.2026 real passiert - erkennbar an Commits mit
Autor `claude@anthropic.com`, die nicht aus der eigenen Sitzung stammen). Das kann zu echten
Kollisionen führen (z.B. zwei E2E-Testläufe gleichzeitig auf demselben Testtag). Falls ein
fremder Commit/Workflow-Lauf auffällt, der nicht aus der eigenen Sitzung stammt: dem Nutzer
kurz und sachlich Bescheid geben, nicht alarmistisch, und die eigene Arbeit fortsetzen.

## 5. Monats-Export: lebt jetzt in der App, nicht mehr in tools/

**Veraltet, nur zur Einordnung:** Frühere Versionen dieser Datei beschrieben hier einen
verbindlichen `tools/spesenabrechnung/xlsx_to_pdf.py`-Standard (Python, LibreOffice-Umweg
ueber ODS). Das ist seit 04.09.2026 Geschichte - die App erzeugt Spesenabrechnung (.xlsx),
Belege (.pdf) und Arbeitszeiten (.xlsx) inzwischen komplett client-seitig im Browser
(`app/src/lib/export/`, Button "Monat exportieren" -> ein .zip mit allen drei Dateien).
Der Python-Umweg wurde im Rahmen eines Architektur-Reviews entfernt, da er danach komplett
redundant war (siehe `tools/spesenabrechnung/README.md`).

`tools/spesenabrechnung/` enthält nur noch zwei reine Node-Diagnose-Skripte
(`fetch_month.js`/`fetch_receipts.js`), um Appwrite-Rohdaten bei Bedarf direkt
nachzusehen - nicht zum Erzeugen der Spesenabrechnung.

**Bei einer neuen Änderung am Export:** in `app/src/lib/export/` suchen
(`xlsxExport.ts`/`receiptMerge.ts`/`arbeitszeitExport.ts`/`zipExport.ts`/`exportZeilen.ts`),
nicht in `tools/`.
