# Spesenabrechnung-Export-Werkzeug

Befüllt `SpesenabrechnungVorlage_neu_ab_012026.xltx` automatisiert mit den Monatsdaten aus
der Zeiterfassungs-App - chirurgisches XML-Patching (kein openpyxl-Neuaufbau), damit
Dropdown-Validierungen und Formeln unversehrt bleiben. Entstanden am 02.09.2026 nach einem
manuellen Export mit drei Fehlschlägen (siehe `PROJEKT_UEBERSICHT.md` für die volle
Fehlergeschichte) - alle damals gefundenen Fallstricke sind hier als automatische
Prüfschritte eingebaut, nicht nur im Gedächtnis.

## Ablauf für einen neuen Monat

**1. Monatsdaten aus Appwrite holen** (braucht Netzwerkzugriff auf `*.appwrite.io` - läuft
nur in einer CI-Umgebung, NICHT in Claudes Sandbox, siehe `CLAUDE_CHECKLIST.md` Abschnitt 0):

```bash
MONTH=2026-09 node fetch_month.js > monatsdaten.json
```

Am einfachsten über einen temporären, `push`-getriggerten GitHub-Actions-Workflow (Muster
siehe `CLAUDE_CHECKLIST.md` Abschnitt 0) - Ergebnis als Datei zurück ins Repo committen und
über die Contents-API abholen, dann den temporären Branch löschen.

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

Das Skript gibt die erkannten Export-Zeilen, die erwartete Gesamtsumme und einen
Verifikationsbericht auf der Konsole aus. **Bricht mit einer Exception ab**, falls
irgendeine der automatischen Prüfungen fehlschlägt - kein stillschweigend fehlerhaftes
Ergebnis mehr.

**4. Trotzdem stichprobenartig selbst gegenprüfen** (das Skript verhindert die drei
bekannten Fehlerklassen, ist aber kein Ersatz für einen kurzen Blick):
```bash
python3 -c "
from pdf2image import convert_from_path
import subprocess
subprocess.run(['soffice','--headless','--norestore','--convert-to','pdf',
                 '--outdir','/tmp', 'Spesenabrechnung_2026-09_Raoul-Huebner.xlsx'])
convert_from_path('/tmp/Spesenabrechnung_2026-09_Raoul-Huebner.pdf', dpi=150)[0].save('/tmp/preview.png')
"
```
Dann `/tmp/preview.png` ansehen. Die VERPFLEGUNGS-MEHRAUFWAND-Spalte zeigt dabei **erwartet**
"#NAME?" (LibreOffice kann `_xlfn.LET` nicht auswerten) - das ist eine reine
Werkzeug-Einschränkung der Vorschau, keine Beschädigung der Datei (siehe Docstring in
`export_xlsx.py`, Fallstrick 5).

## Was das Skript NICHT prüfen kann

- Ob die `_xlfn.LET`-Formel im echten Excel des Nutzers korrekt rechnet (kann in dieser
  Umgebung nicht mit einer echten Excel-Installation getestet werden) - die Cache-Werte sind
  aber ohnehin bereits korrekt vorberechnet mitgeliefert, das ist nur ein zusätzliches
  Sicherheitsnetz.
- Inhaltliche Richtigkeit der Beschreibungstexte - IMMER die vom Skript ausgegebene Liste der
  Export-Zeilen gegen die echten App-Daten gegenlesen (ein Copy-Paste-Fehler bei einer
  Beschreibung ist am 02.09.2026 real passiert, hatte aber nichts mit der Datei-Struktur zu
  tun).

## Nächster Schritt (noch nicht gebaut, Stand 02.09.2026)

Die fertige `.xlsx` + die einzelnen Beleg-PDFs zu einem einzigen, direkt einreichbaren PDF
zusammenführen (wie der Nutzer es für Juli 2026 manuell gemacht hat).
