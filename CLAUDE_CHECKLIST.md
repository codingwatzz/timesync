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

(Dieser Abschnitt existiert, weil genau das am 01.09.2026 vergessen wurde: eine Chat-Sitzung
hatte ein Token und konnte damit vieles verifizieren; die Übergabe an die nächste Sitzung
erwähnte nirgends, dass dafür überhaupt ein Token nötig ist - die neue Sitzung stieß dadurch
unerwartet auf Rate-Limits und konnte Appwrite Storage nicht prüfen.)

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
  `.github/workflows/deploy-production.yml`, Ausnahmeliste im `find`-Befehl). Bei jeder neuen
  Root-Datei: prüfen, ob sie in dieser Ausnahmeliste steht.
