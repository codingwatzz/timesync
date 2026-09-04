# Diagnose-Werkzeuge: Appwrite-Daten abrufen

Zwei reine Node-Skripte, um Monatsdaten und Beleg-Dateien direkt aus Appwrite abzurufen -
zur Diagnose/Verifikation, NICHT zum Erzeugen der Spesenabrechnung selbst (das macht die
App inzwischen komplett im Browser, siehe `app/src/lib/export/` - "Monat exportieren"
liefert ein .zip mit Spesenabrechnung.xlsx + Belege.pdf + Arbeitszeiten.xlsx in einem
Download).

**Geschichte (04.09.2026):** Bis zu diesem Datum gab es hier zusätzlich `export_xlsx.py`,
`merge_pdf.py` und `xlsx_to_pdf.py` - ein Python-Werkzeug, das denselben Export manuell
erzeugte, bevor die App das selbst konnte. Nach dem Umbau auf den client-seitigen Export
(`app/src/lib/export/`) war das komplett redundant und wurde im Rahmen eines
Architektur-Reviews entfernt (siehe Git-Historie, falls die alte Herangehensweise je wieder
gebraucht wird - z.B. `tools/spesenabrechnung/export_xlsx.py` im Commit vor diesem README).

## Wann diese Skripte noch nützlich sind

Zum direkten Nachsehen/Verifizieren der in Appwrite gespeicherten Rohdaten - z.B. um zu
prüfen, ob ein bestimmter Beleg korrekt gespeichert wurde, ob ein Tageseintrag die
erwarteten Werte hat, oder um eine Datei nach einer nachträglichen Korrektur direkt
gegenzuprüfen (mehrfach in dieser Form genutzt, z.B. bei der rückwirkenden
Kontrastkorrektur der August-Belege am 04.09.2026).

**WICHTIG:** Läuft nur in einer Umgebung mit Netzwerkzugriff auf `*.appwrite.io` (z.B.
GitHub Actions über einen temporären Branch), NICHT in Claudes eigener Sandbox - siehe
`CLAUDE_CHECKLIST.md` Abschnitt 0.

## fetch_month.js - Monatsdaten abrufen

```bash
MONTH=2026-09 node fetch_month.js > monatsdaten.json
```

Liefert alle Tage des Monats inkl. `exists`-Flag und dem vollen `entry`-Objekt (Start/Ende/
Pause, Kosten, Reiseart, `receiptIds`, ...) als JSON.

## fetch_receipts.js - Beleg-Dateien herunterladen

Erwartet `monatsdaten.json` (von oben) im aktuellen Verzeichnis:

```bash
node fetch_receipts.js
```

Lädt jede referenzierte Beleg-Datei nach `receipts/<rid>.pdf` und schreibt `manifest.json`
(`rid -> {file, name, date, ok, error}`).

## Wichtige Fallstricke (weiterhin gültig)

- **Datei-IDs in Appwrite Storage haben das Präfix `receipt_`** (aus `receipt:<rid>` wird
  über `toAppwriteId()` `receipt_<rid>` - der Doppelpunkt wird zu einem Unterstrich). Bei
  direkten Storage-Zugriffen (z.B. `storage.getFile`/`deleteFile`/`createFile`) IMMER dieses
  Präfix verwenden, nicht den rohen `rid` - ein Fix am 04.09.2026 landete dadurch zunächst an
  einer falschen, verwaisten Datei-ID, während die echte Datei unangetastet blieb (siehe
  Git-Historie "receipt_-Praefix" für die volle Geschichte).
- Kein API-Key nötig - die Appwrite-Bucket-/Tabellen-Rechte sind bewusst auf "Any" gesetzt
  (öffentliches Repo + öffentliche Zugangsdaten im Client-Code, siehe
  `Projekt-Uebersicht_Zeiterfassung-App.md`).
- GitHub Contents-API hat ein ~1-MB-Limit für Dateien, die per `contents`-Endpunkt aus einem
  Branch gelesen werden (z.B. um ein Ergebnis aus einem temporären Branch zurückzuholen) -
  bei größeren Dateien liefert sie `encoding: "none"` und ein leeres `content`, ohne Fehler.
  Workaround: `sha` aus der Contents-Antwort nehmen und über die Git-Blobs-API
  (`GET /repos/<repo>/git/blobs/<sha>`, bis 100 MB) abrufen.
