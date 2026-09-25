# Appwrite-Keepalive (Versuch, die Free-Tier-Inaktivitäts-Pause zu umgehen)

Hintergrund: siehe `PROJEKT_UEBERSICHT.md` (Abschnitt "Backend") und `CLAUDE_CHECKLIST.md`
(Abschnitt 3) - Appwrite pausiert Free-Plan-Projekte nach 7 Tagen ohne "Entwicklungsaktivität".

**Ehrliche Einordnung, keine Erfolgsgarantie:** Appwrite sagt offiziell, dass normale
API-/SDK-Nutzung dafür NICHT zählt, nur Aktivität in der Console. Dieses Skript schreibt
stattdessen über einen **API-Key** (nicht über die normale App-Anmeldung) - ein Community-Tool
behauptet, das zähle sehr wohl als Aktivität, offiziell bestätigt ist das aber nicht. Falls
das Projekt trotzdem wieder pausiert wird, ist das kein Fehler in diesem Skript - dann bleibt
nur der übliche Weg (in der Console manuell "Restore project" klicken).

## Einmaliges Setup (nur der Nutzer kann das - kein Konsolen-Zugriff für Claude möglich)

1. **API-Key erstellen:** In der Appwrite-Console → Projekt → Settings → API Keys →
   "Create API Key". Name z.B. `keepalive`. Scope: NUR "Databases" (möglichst eng - dieser
   Key braucht keinen Storage-/Auth-/Functions-Zugriff). Key kopieren (wird nur einmal
   angezeigt).
2. **Als GitHub-Secret hinterlegen:** Repo → Settings → Secrets and variables → Actions →
   "New repository secret" → Name `APPWRITE_KEEPALIVE_KEY`, Wert = der eben erstellte Key.
3. **Zeitplan selbst aktivieren:** In `.github/workflows/appwrite-keepalive.yml` fehlt absichtlich
   die `schedule:`-Zeile - siehe Kommentar dort, warum das bewusst NICHT von Claude committet
   werden sollte (GitHub-Mail-Benachrichtigungen bei einem fehlschlagenden geplanten Lauf hängen
   an dem, der die `cron:`-Zeile zuletzt committet hat). Bitte die zwei auskommentierten Zeilen
   selbst im GitHub-Web-UI einfügen (Repo → `.github/workflows/appwrite-keepalive.yml` →
   Bearbeiten-Stift).
4. **Testen:** Actions-Tab → "Appwrite Keepalive" → "Run workflow" (manueller Trigger geht
   auch ohne Schritt 3).

## Was das Skript macht

Schreibt alle 5 Tage eine einzelne Zeile (`rowId: "heartbeat"`) in die bestehende
`key-value`-Tabelle - bewusst ohne `entry:`/`receipt:`-Präfix, kollidiert nicht mit echten
Daten und wird von der App nie gelesen (sie fragt immer gezielt einzelne IDs ab, nie die
ganze Tabelle).
