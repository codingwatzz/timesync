# Spesenabrechnung-Export-Werkzeug

Befüllt `SpesenabrechnungVorlage_neu_ab_012026.xltx` automatisiert mit den Monatsdaten aus
der Zeiterfassungs-App und führt das Ergebnis mit den Beleg-PDFs zu einem einzigen, direkt
einreichbaren Gesamt-PDF zusammen. Entstanden am 02.09.2026 nach einem manuellen Export mit
drei Fehlschlägen (siehe `PROJEKT_UEBERSICHT.md` für die volle Fehlergeschichte) - alle
damals gefundenen Fallstricke sind hier als automatische Prüfschritte eingebaut, nicht nur
im Gedächtnis.

## Ablauf für einen neuen Monat

**1. Monatsdaten aus Appwrite holen** (braucht Netzwerkzugriff auf `*.appwrite.io` - läuft
nur in einer CI-Umgebung, NICHT in Claudes Sandbox, siehe `CLAUDE_CHECKLIST.md` Abschnitt 0):

```bash
MONTH=2026-09 node fetch_month.js > monatsdaten.json
```

**2. Vollständigkeit prüfen** (empfohlen, bevor exportiert wird): `monatsdaten.json` enthält
alle Tage inkl. der referenzierten Belege - prüfen auf fehlende Belege bei Ausgaben,
fehlende Reiseart an "vor Ort"-Tagen, etc. (siehe Vorgehen vom 02.09.2026 in
`PROJEKT_UEBERSICHT.md`).

**3. Excel-Datei erzeugen** (läuft in Claudes normaler Sandbox, kein Netzwerk nötig):

```bash
python3 export_xlsx.py \
  --template /mnt/project/SpesenabrechnungVorlage_neu_ab_012026.xltx \
  --data monatsdaten.json \
  --name "Raoul Hübner" \
  --output Spesenabrechnung_2026-09_Raoul-Huebner.xlsx
```

Gibt die erkannten Export-Zeilen, die erwartete Gesamtsumme und einen Verifikationsbericht
aus. **Bricht mit einer Exception ab**, falls irgendeine automatische Prüfung fehlschlägt.

**4. Beleg-PDFs herunterladen** (braucht wieder Netzwerkzugriff, wie Schritt 1):

```bash
MONTH=2026-09 node fetch_month.js > monatsdaten.json   # falls noch nicht vorhanden
node fetch_receipts.js
```

Erwartet `monatsdaten.json` im aktuellen Verzeichnis (oder per `DATA_PATH`-Umgebungsvariable
anders benennen), schreibt jeden Beleg nach `receipts/<rid>.pdf` und ein `manifest.json`.
Gibt am Ende einen Fehlercode zurück, falls ein Beleg nicht heruntergeladen werden konnte -
nicht einfach ignorieren, sondern die genannte `rid` in Appwrite Storage nachprüfen.

**Wichtig beim Abholen groSSer Dateien aus dem CI-Lauf:** Die normale GitHub-Contents-API
(`GET .../contents/<pfad>`) liefert bei Dateien **über ~1&nbsp;MB kein Inline-`content`** mehr
(`encoding: "none"`, leerer Inhalt) - das betrifft schnell den `receipts/`-Ordner oder ein
gepacktes Zip davon. Workaround: die `sha` aus der Contents-Antwort nehmen und stattdessen
die **Git-Blobs-API** verwenden (funktioniert bis 100&nbsp;MB):
```bash
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/<repo>/git/blobs/<sha>" | \
  python3 -c "import json,sys,base64; d=json.load(sys.stdin); open('out','wb').write(base64.b64decode(d['content']))"
```

**5. Alles zu einem Gesamt-PDF zusammenführen:**

```bash
python3 merge_pdf.py \
  --xlsx Spesenabrechnung_2026-09_Raoul-Huebner.xlsx \
  --data monatsdaten.json \
  --manifest manifest.json \
  --output Spesenabrechnung_2026-09_Raoul-Huebner_komplett.pdf
```

Rendert die `.xlsx` per LibreOffice zu PDF (Seite 1) und hängt die Beleg-PDFs in derselben
Reihenfolge wie die Zeilen der Abrechnung an (Datum aufsteigend) - so kann der Prüfende
Zeile für Zeile mitgehen. Meldet **Zeilen ohne Beleg** (informativ) und **fehlende Belege**
(Fehler, Exit-Code 1) getrennt.

**6. Trotzdem stichprobenartig selbst gegenprüfen** (die Skripte verhindern die bekannten
Fehlerklassen, sind aber kein Ersatz für einen kurzen Blick auf das Ergebnis-PDF).

## Was die Skripte NICHT prüfen können

- Ob die `_xlfn.LET`-Formel (Verpflegungsmehraufwand) im echten Excel des Nutzers korrekt
  rechnet (kann in dieser Umgebung nicht mit einer echten Excel-Installation getestet
  werden) - die Cache-Werte sind aber bereits korrekt vorberechnet mitgeliefert, das ist nur
  ein zusätzliches Sicherheitsnetz. Beim LibreOffice-Rendern in Schritt 3/6 zeigt diese
  Spalte deshalb **erwartet** "#NAME?" - keine Beschädigung, reine Werkzeug-Einschränkung.
- Inhaltliche Richtigkeit der Beschreibungstexte - IMMER die vom Skript ausgegebene Liste der
  Export-Zeilen gegen die echten App-Daten gegenlesen (ein Copy-Paste-Fehler bei einer
  Beschreibung ist am 02.09.2026 real passiert).

## Möglicher nächster Schritt (noch nicht gebaut)

Sehr kleine Belege (z.B. mehrere Parkquittungen) automatisch auf einer gemeinsamen Seite
zusammenlegen, statt jedem Beleg eine eigene Seite zu geben - der Nutzer hat das für Juli
2026 manuell gemacht. Bisher hängt `merge_pdf.py` jeden Beleg als eigene Seite(n) an.

