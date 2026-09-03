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

**5. Alles zu einem Gesamt-PDF zusammenführen (rendert die ECHTE .xlsx, keine Nachbildung):**

```bash
pip install -r requirements.txt   # einmalig
python3 merge_pdf.py \
  --template SpesenabrechnungVorlage_neu_ab_012026.xltx \
  --data monatsdaten.json \
  --manifest manifest.json \
  --name "Raoul Hübner" \
  --output Spesenabrechnung_2026-09_Raoul-Huebner_komplett.pdf
```

Baut zuerst die echte `.xlsx` (wie `export_xlsx.py` allein), rendert sie dann per
`xlsx_to_pdf.py` zu einer einzelnen PDF-Seite - **die tatsächliche Excel-Tabelle, keine
Nachbildung** (siehe "Wichtig" unten). Wandelt jede Beleg-Seite in Graustufen um (kein
Zuschnitt), bevor sie angehängt wird - in Datumsreihenfolge wie die Zeilen der Abrechnung.
Meldet **Zeilen ohne Beleg** (informativ) und **fehlende Belege** (Fehler, Exit-Code 1)
getrennt.

**Wichtig (03.09.2026):** Zwei Zwischenversuche sind gescheitert, bevor diese Lösung
gefunden wurde:
1. Direktes `soffice --convert-to pdf` auf die `.xlsx` verliert Tabellenrahmen komplett
   (reproduziert auch an der VÖLLIG UNVERÄNDERTEN Original-Vorlage - Theme-Farbe+Tint-
   kodierte Rahmenfarben werden von LibreOffice beim direkten XLSX→PDF-Export offenbar
   nicht aufgelöst).
2. Ein Nachbau der Seite von Grund auf (reportlab) wurde vom Nutzer zurecht abgelehnt -
   "soll GENAU wie die Vorlage aussehen, nur mit anderen Inhalten", nicht nur ähnlich.

Die tatsächliche Lösung (`xlsx_to_pdf.py`): XLSX → ODS → PDF (der ODS-Zwischenschritt
behebt die fehlenden Rahmen der NEBENTABELLE zuverlässig), plus vier gezielte Fixes NUR in
der Rendering-Kopie (die echte `.xlsx` bleibt unangetastet):
- Das Buchhaltungs-Zahlenformat der Vorlage wird von LibreOffices ODS-Export nicht sauber
  übersetzt (zeigte den rohen Formatcode als Text, z.B. "_(€ 14.00_)") - ersetzt durch ein
  einfaches, optisch sehr ähnliches Format (`_fix_accounting_number_format`).
- Die VERPFLEGUNGSMEHRAUFWAND-Formel (`_xlfn.LET`) wird von LibreOffice IMMER auszuwerten
  versucht (auch ohne fullCalcOnLoad) und zeigt "#NAME?" - ersetzt durch ihren eigenen,
  bereits korrekt vorberechneten Cache-Wert (`_strip_formula_keep_value`).
- Die HAUPTTABELLE (Datum/Beschreibung/...) ist ein Excel-Tabellenobjekt, das sein Gitter
  über einen benutzerdefinierten Tabellenstil bezieht (nicht über echte Zellrahmen) - Excel
  rendert diesen Stil automatisch, LibreOffice nicht. Die Rahmen-Definition aus dem
  Tabellenstil wird als echte Zellrahmen auf die betroffenen Zellstile übertragen
  (`_add_table_grid_borders`).
- LibreOffice ignoriert über diesen Konvertierungsweg jedes Zahlenformat für Datumszellen
  (zeigt M/D/YYYY statt DD.MM.YYYY, unabhängig vom Formatcode) - Datumszellen werden durch
  bereits korrekt vorformatierten Text ersetzt (`_dates_as_text`), betrifft Spalte B und die
  von/bis-Felder (H5/H6).

**Vom Nutzer am 03.09.2026 bestätigt: entspricht jetzt 1:1 der echten Vorlage (Rahmen,
Farben, Datumsformat, Werte) - das ist der verbindliche Standard für alle künftigen
Monate, nicht weiter verändern ohne erneuten Anlass.**

### Beleg-Aufbereitung

Jede Beleg-Seite wird in Graustufen umgewandelt (kein Zuschnitt, kein Schwellenwert) und mit
JPEG-Kompression (quality=85) eingebettet.

**Wichtig (03.09.2026):** Es gab hier zwei zwischenzeitliche, wieder entfernte Zusatzschritte:
- **Automatischer Randzuschnitt** (Scanic, github.com/marquaye/scanic): in der echten Nutzung
  (mehrere Testfotos unter guten Lichtverhältnissen) nicht zuverlässig genug - der Nutzer hat
  auf eigenen Wunsch die Entfernung veranlasst ("zu kompliziert, funktioniert nicht").
- **Harter Schwarz-Weiß-Schwellenwert** (um Speicher zu sparen): verfälschte einzelne Ziffern
  der Kassenbon-Schriftart (z.B. wurde "0" zu "3") - reproduzierbar auch bei einem sauberen,
  gut ausgeleuchteten Foto. Bei einem Finanzbeleg darf keine Ziffer optisch verfälscht
  aussehen, auch nicht für zusätzliche Speicherersparnis - Verlässlichkeit geht vor
  Dateigröße/Komplexität. Zurück zum einfachen, seit Monaten bewährten Stand: nur
  Graustufen, keine externe Bibliothek nötig.

**6. Trotzdem stichprobenartig selbst gegenprüfen** (die Skripte verhindern die bekannten
Fehlerklassen, sind aber kein Ersatz für einen kurzen Blick auf das Ergebnis-PDF - insb. ob
die auf den Belegen aufgedruckten Beträge mit den in der App eingetragenen übereinstimmen;
das prüft keines der Skripte automatisch).

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

