# Arbeits-Checkliste für Claude (verbindlich, jede Sitzung)

Diese Datei existiert, weil Claude sich zwischen Chat-Sitzungen an nichts erinnert. Sie ist das
Gedächtnis. **Vor Beginn jeder Aufgabe in diesem Projekt: diese Datei lesen.**

Entstanden am 31.08.2026 nach einer Sitzung, in der Ressourcen unnötig verbraucht wurden
(viele Live-Testzyklen für einzelne Vermutungen) und zwei Dinge übersehen wurden (ein Bug
blieb an mehreren Stellen unbehoben, personenbezogene Daten blieben im öffentlichen Git-
Verlauf liegen). Konkrete Regeln daraus:

## 0. GitHub-Zugangsdaten (WICHTIG, zuerst prüfen)

Für alles, was über reines Lesen des öffentlichen Repo-Inhalts hinausgeht - Commits pushen,
Workflows auslösen, Secrets verwalten, Pages-Einstellungen ändern, per GitHub-API mit
vernünftigem Rate-Limit arbeiten, oder über einen CI-Lauf einen echten Browser mit
Appwrite-Zugriff starten - wird ein **GitHub Personal Access Token** gebraucht.

**Falls kein Token im aktuellen Chat bekannt ist: den Nutzer aktiv danach fragen**, bevor
größere Arbeit begonnen wird. Das Token gehört NIEMALS in eine Projekt-Datei, eine
Commit-Message oder sonst einen dauerhaften Ort - immer nur direkt im Chat vom Nutzer
übergeben lassen. **Nach jeder Sitzung, in der ein Token geteilt wurde: dem Nutzer empfehlen,
es zu rotieren/widerrufen** (GitHub → Settings → Developer settings → Personal access
tokens) - der Chatverlauf selbst ist nicht flüchtig, ein geteiltes Token sollte behandelt
werden, als wäre es kurzzeitig exponiert gewesen.

**Fine-grained PATs sind nach dem Erstellen nicht mehr um weitere Scopes erweiterbar** - für
einen zusätzlich benötigten Scope muss der Nutzer ein komplett neues Token erstellen.
`Contents`, `Actions`, `Workflows`, `Secrets` und `Pages` sind jeweils EIGENE, unabhängige
Berechtigungskategorien - ein Token mit `Actions: Read and write` kann trotzdem an
`GET/DELETE .../actions/secrets` oder `PUT .../pages` mit 403 scheitern. Vor einer Aufgabe,
die eine dieser Kategorien betrifft, kurz überlegen, ob das aktuelle Token sie wahrscheinlich
hat, statt erst beim 403 danach zu fragen (real erlebt 07.09.2026: Secrets-Löschung und
Pages-Quelle-Umstellung brauchten beide ein zusätzliches Scope, das ursprüngliche
Actions-Token allein reichte nicht).

**Falls ein Token (noch) keinen `Actions`-Scope hat:** `workflow_dispatch` per API und
`GET/DELETE .../actions/secrets` schlagen mit 403 fehl, ebenso `GET .../runs/{id}/logs`
(scheitert zusätzlich an der Sandbox-Netzwerksperre, Redirect auf
`results-receiver.actions.githubusercontent.com`). Workaround für `workflow_dispatch`: einen
temporären Branch mit einem `push`-getriggerten Workflow anlegen. Workaround für Logs:
Ergebnis als Datei im selben Workflow-Lauf zurück ins Repo committen (wie `e2e-test.yml` es
für `last-result.json` tut) und über die Contents-API abholen.

**Contents-API hat ein ~1-MB-Limit für Inline-Inhalte** (z.B. bei größeren Beleg-PDFs): die
Antwort liefert dann `encoding: "none"` und ein leeres `content`-Feld, ohne Fehlermeldung.
Workaround: die `sha` aus der Contents-Antwort nehmen und die Git-Blobs-API verwenden
(funktioniert bis 100 MB): `GET /repos/<repo>/git/blobs/<sha>`.

**Empfohlenes Vorgehen für Push + Live-Verifikation in einem Rutsch** (funktioniert
zuverlässig mit einem Actions-berechtigten Token, zuletzt bestätigt 07.09.2026): Push →
`workflow_dispatch` → EIN langer `sleep` (z.B. 240s) statt mehrfachem Polling → Ergebnis per
Contents-API abholen. Danach den Nutzer zur Token-Rotation erinnern.

## 0b. Tool-/Actions-Zeit ist ein echter Kostenfaktor - effizient verifizieren, nicht im Zweifel doppelt

Ein einzelner kleiner, gut verstandener Fix (05.09.2026, CSS `min-width:0`) hat durch ineffiziente
Verifikation >17 Minuten Tool-Zeit gekostet. Konkrete Lehren, künftig verbindlich:

- **Bei einem etablierten, gut verstandenen Muster** (z.B. bekannte CSS-Regel, Standard-Fix
  aus der eigenen Fachkenntnis) NICHT vorher UND nachher screenshotten/verifizieren - nur
  EINMAL danach, zur Bestätigung. Ein "Vorher"-Beweis ist nur nötig, wenn die Diagnose selbst
  unsicher ist (z.B. mehrere mögliche Ursachen im Raum stehen), nicht um die eigene
  Unsicherheit über einen ohnehin klaren Fix abzusichern.
- **Temporäre Branches bei Bedarf neu anlegen statt zu rebasen/mergen.** Ein Rebase/Merge
  eines Temp-Branches auf einen aktualisierten `main` (inkl. der Build-Artefakt-Commits vom
  Deploy-Workflow) erzeugt unnötige Merge-Konflikte und Identitäts-Fehler. Einfacher: alten
  Temp-Branch löschen, neuen frisch von `main` erstellen.
- **Immer EIN langer Einzel-Wartezeitraum statt mehrerer kurzer Polling-Durchläufe** - jeder
  Status-Check ist ein Tool-Aufruf, jeder davon kostet. Ein einzelnes `sleep 90` gefolgt von
  einem Check ist fast immer besser als 6x `sleep 15` + Check.
- **Playwright/Chromium kann NICHT lokal in Claudes Sandbox installiert werden** (Netzwerk-
  Sperre blockiert den Chrome-Download) - jede visuelle/Screenshot-Verifikation braucht
  zwingend einen vollen GitHub-Actions-Durchlauf (~60-90s allein für Playwright-Install).
  Deshalb Screenshot-Verifikation sparsam einsetzen: nur bei echter Unsicherheit über die
  Diagnose selbst, nicht routinemäßig für jede CSS-/UI-Änderung.
- **Einmalige Diagnose-/Repro-Skripte (nicht Teil der regulären E2E-Suite) MÜSSEN einen
  sicheren Test-Monat treffen, genau wie `navigateToSafeTestMonth()` das für die reguläre
  Suite schon tut - NIEMALS den aktuell angezeigten/echten Monat.** Ein am 05.09.2026 schnell
  geschriebenes Repro-Skript (CSS-Overflow-Bug) nutzte naiv `dayRows.first()` im gerade
  offenen Monat - landete dadurch auf dem echten 01.09.2026 und hinterließ dort einen echten
  Test-Beschreibungstext + einen echten Test-Beleg-Upload in Appwrite, unbemerkt bis der
  Nutzer es selbst im Kalender sah und manuell aufräumen musste. Regel: JEDES Skript, das
  gegen die Live-App schreibt (auch ein schnelles Einweg-Diagnose-Skript), muss entweder
  `navigateToSafeTestMonth()` wiederverwenden oder explizit einen weit in der Zukunft
  liegenden Monat ansteuern, NIE den Status quo einfach übernehmen.

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
  (`test/e2e/steps/importFlow.js`, bis zu ~140s über 10 Versuche mit gedeckeltem Backoff, plus
  direkter Appwrite-Read als Diagnose ab dem 3. Versuch). Nicht erneut als Bug behandeln.
- `page.waitForFunction(fn, options)` in Playwright ist FALSCH - das Options-Objekt wird sonst
  als Funktionsargument gebunden, das Timeout wird stillschweigend ignoriert. Immer:
  `page.waitForFunction(fn, undefined, options)`.
- Meine Sandbox kann `*.github.io` nicht direkt anfragen (Netzwerk-Freigabeliste). Status der
  Live-App IMMER über die GitHub-API (Pages-Build-Status) oder über E2E-Testergebnisse
  prüfen, nie per direktem `curl`/`web_fetch` auf die Live-URL.
- **"Nicht überschreiben, außer..."-Sicherheitschecks IMMER an einem Zeitstempel/einer
  Lauf-ID festmachen, nicht an bloßer Gültigkeit** (`test/e2e.js` prüfte früher nur "ist die
  Datei gültiges JSON", eine alte Datei von einem früheren Lauf bestand die Prüfung dadurch
  fälschlich - behoben mit `runStartTime`-Vergleich).
- **Deploy läuft seit 07.09.2026 über die offizielle GitHub-Pages-Actions-Bereitstellung**
  (`actions/deploy-pages`), nicht mehr über einen Build-Commit in den `main`-Root. Der frühere
  "Root-Ausnahmeliste"-Bug (zweimal versehentlich README/CLAUDE_CHECKLIST/`tools/` gelöscht)
  ist damit strukturell nicht mehr möglich, nicht nur behoben - bei neuen Root-Einträgen ist
  seitdem nichts mehr zu beachten.
- `navigateToSafeTestMonth()` in der E2E-Suite steuert IMMER einen Dezember an (garantiert
  Feiertage für den Test). Der erreichbare Bereich wurde von 60-84 auf 60-180 Monate erweitert,
  um Test-Kollisionen bei mehreren Läufen kurz hintereinander zu vermeiden. Bei einem
  Fehlschlag nach einem manuellen Rerun: erst gegenprüfen, ob er von einem eigenen vorherigen
  Lauf auf demselben Testtag stammt, bevor auf einen Code-Bug geschlossen wird.
- **Beleg-Upload macht zwei getrennte, nacheinander abgewartete Appwrite-Schreibvorgänge**
  (Datei hochladen, dann Tageseintrag mit der neuen `receiptId` aktualisieren) - eine
  Unterbrechung dazwischen (z.B. mobiler Browser pausiert während der nativen Kamera-App)
  könnte sonst eine unsichtbare Karteileiche hinterlassen. Abgesichert durch
  `pendingReceiptLinks.ts`: Absicht wird synchron VOR beiden Schreibvorgängen vermerkt,
  `repairPendingReceiptLinks` holt liegen gebliebene Verknüpfungen beim nächsten App-Start
  automatisch nach.
- **Appwrite-Storage-Datei-IDs für Belege haben das Präfix `receipt_`** (aus `receipt:<rid>`
  wird über `toAppwriteId()` `receipt_<rid>`). Bei DIREKTEN Storage-Zugriffen (eigene
  Diagnose-Skripte, nicht die App selbst) immer dieses Präfix verwenden, nicht den rohen
  `rid` - sonst landet man an einer verwaisten Datei, während die echte unangetastet bleibt.
  Bei Verifikation nach einem Fix immer die ID-Herleitung selbst hinterfragen, nicht nur
  "kommt dieselbe Datei zurück, die ich geschrieben habe" prüfen (kann denselben Fehler
  wiederholen statt ihn aufzudecken).
- **Appwrite Storage-Downloads laufen hinter einem CDN (Varnish)** - `fetch(url, {cache:
  'no-store'})` beeinflusst nur den LOKALEN Browser-Cache, nicht das CDN. Fix: einen sich
  ändernden Query-Parameter an die URL anhängen (`&_cb=${Date.now()}`) - bereits so in
  `appwriteStore.ts` implementiert.
- **GitHub-Email-Benachrichtigung für geplante (`schedule:`-)Workflow-Läufe hängt daran, wer
  die `cron:`-Zeile zuletzt committet hat** - nicht an dem, der den Lauf beobachtet/auslöst.
  Committet Claude diese Zeile unter einer Fantasie-Identität (z.B. `claude@anthropic.com`),
  gehen künftige Ausfall-Mails für den geplanten Lauf ins Leere, ohne dass das auffällt (real
  passiert, erst nach Tagen bemerkt). **Regel:** die `cron:`-Zeile möglichst NICHT von Claude
  aus committen, sondern den Nutzer bitten, eine minimale Änderung selbst im GitHub-Web-UI
  vorzunehmen, wenn die Zuordnung mal korrigiert werden muss.
- **`#f_pause`/`#f_pause2` in `DetailSheet.tsx` sind `<select>`-Dropdowns**, keine
  Text-Eingabefelder - `page.fill()` wirft darauf einen Fehler, `page.selectOption()`
  verwenden. Bei neuen Formularfeld-Änderungen (Text-Input → Select o.ä.) aktiv prüfen, ob
  betroffene E2E-Schritte noch `fill()` statt `selectOption()`/`check()` verwenden - dieser
  Fehler blieb einmal unbemerkt, weil E2E nicht mehr bei jedem Push läuft.
- **UI-Redesigns haben wiederholt denselben Fehler gemacht: CSS-Klassen entfernt, die nur
  noch als E2E-Selektor dienten** (fünfmal in Folge, jedes Mal erst durch einen echten
  E2E-Absturz bemerkt). **Verbindliche Regel: vor JEDER Aufgabe, die Klassennamen an
  bestehenden Komponenten ändert/entfernt** (Restyling, Refactoring, Icon-Umbau, egal wie
  klein) - ALLE Selektoren aus `test/e2e/*.js` + `test/e2e/steps/*.js` per grep extrahieren
  (aus den tatsächlichen `.locator()`/`.click()`/`querySelector()`-Aufrufen) und JEDEN einzeln
  gegen den neuen Code prüfen. Danach trotzdem einen echten E2E-Lauf einplanen, nicht nur der
  eigenen Prüfung vertrauen.
- **Tailwind v4: Utility-Klasse für mehrteilige Theme-Token-Namen ist der VOLLE Suffix nach
  `--color-`.** `--color-text-on-accent` → Klasse `text-text-on-accent`/`bg-text-on-accent`,
  NICHT `text-on-accent`. Bei projektweitem Suchen-Ersetzen für Token-Umbenennungen immer das
  volle Präfix (`bg-`/`text-`/`border-`) ins Suchmuster aufnehmen, sonst werden andere, schon
  korrekte Verwendungen versehentlich mit-verändert.
- **`git push` nach Deploy-/E2E-Läufen routinemäßig als "rejected" erwarten, nicht als
  Fehler werten.** Beide committen automatisch zurück (`[skip ci]`-Commits). Vor JEDEM eigenen
  Push: `git fetch origin main && git rebase origin/main`, dann erst pushen.
- **Fine-grained GitHub-PATs sind nach dem Erstellen nicht mehr um weitere Scopes
  erweiterbar** - siehe Abschnitt 0 für Details zu Token-Scopes.
- **`core/entry.ts::emptyEntry()` setzt `ho: true` als Standard für JEDEN Tag**, unabhängig
  vom Tagestyp - kein echtes Nutzer-Signal. Bei Prüfungen "hat dieser Tag schon echte Daten"
  NIEMALS `ho` alleine werten (siehe `DetailSheet.tsx::hatVersteckbareDaten()`).
- **Bei Zahl-Parsing-Bugs IMMER projektweit grep'en** (`grep -rn "parseFloat\|Number("`),
  nicht nur die offensichtliche Stelle fixen. Die Komma-Unsicherheit von `<input
  type="number">` (behoben 06.09.2026: `type="text" inputMode="decimal"` + zentrale
  `core/formatters.ts::toNumber()`) steckte in DREI unabhängigen Parser-Kopien, die dritte
  wurde erst nach dem ersten "fertig" gefühlten Fix gefunden. Duplikate an unerwarteten
  Stellen sind der Normalfall, nicht die Ausnahme.
- **Bei "Datei rein → sofort verarbeiten"-Mustern (Import, Restore o.ä.) immer prüfen, ob
  ein Schreibvorgang OHNE Vorschau/Bestätigung passiert** - Funktionieren und Sicherheit sind
  zwei verschiedene Prüfungen (Import schrieb früher sofort und ohne Rückfrage in den Store,
  behoben 06.09.2026: zweistufig über `importPlan.ts` + `ImportConfirmDialog.tsx`).
- **`KVStore.get/set/delete` (`appwriteStore.ts`) werfen bei einem ECHTEN Fehler, geben aber
  `null` zurück, wenn ein Schlüssel wirklich nicht existiert** (behoben 07.09.2026 - vorher
  wurden beide Fälle gleich behandelt, ein fehlgeschlagener Beleg-Upload z.B. wurde als
  Erfolg gemeldet). Beim Ändern dieser Datei: diese Unterscheidung nicht wieder aufweichen,
  `isNotFoundError()` ist dafür der richtige Test.

## 4. Parallele Sitzungen

Es kann vorkommen, dass der Nutzer mehrere Chat-Sitzungen gleichzeitig gegen dasselbe Repo/
dieselbe Appwrite-Instanz laufen lässt (am 01.09.2026 real passiert - erkennbar an Commits mit
Autor `claude@anthropic.com`, die nicht aus der eigenen Sitzung stammen). Das kann zu echten
Kollisionen führen (z.B. zwei E2E-Testläufe gleichzeitig auf demselben Testtag). Falls ein
fremder Commit/Workflow-Lauf auffällt, der nicht aus der eigenen Sitzung stammt: dem Nutzer
kurz und sachlich Bescheid geben, nicht alarmistisch, und die eigene Arbeit fortsetzen.

## 5. Monats-Export lebt in der App, nicht in `tools/`

Spesenabrechnung (.xlsx), Belege (.pdf) und Arbeitszeiten (.xlsx) werden komplett
client-seitig im Browser erzeugt (`app/src/lib/export/`, Button "Monat exportieren" → ein
.zip mit vier Dateien inkl. Rohdaten-Backup, siehe `PROJEKT_UEBERSICHT.md`). `tools/` enthält
nur noch zwei reine Node-Diagnose-Skripte (`fetch_month.js`/`fetch_receipts.js`) für direkte
Appwrite-Abfragen, kein Export-Code mehr.

**Bei einer neuen Änderung am Export:** in `app/src/lib/export/` suchen
(`xlsxExport.ts`/`receiptMerge.ts`/`arbeitszeitExport.ts`/`zipExport.ts`/`exportZeilen.ts`),
nicht in `tools/`.
