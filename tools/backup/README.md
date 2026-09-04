# Monatliches Backup (Appwrite → Google Drive)

Holt einmal im Monat (automatisch, am 1. um 05:00 UTC, oder manuell über die GitHub-Actions-UI
"Run workflow") ALLE Tageseinträge und Belege (echte Dateien, nicht nur Metadaten) aus Appwrite
und lädt sie als eine JSON-Datei zu Google Drive hoch.

## Warum ein eigener API-Key statt des App-Logins?

Dieses Tool läuft in GitHub Actions - einer echten Server-Umgebung, kein Browser. Ein
Appwrite-**Server**-API-Key (`node-appwrite`, nicht das Browser-SDK `appwrite`) ist hier die
richtige Wahl, anders als bei der App selbst (siehe `PROJEKT_UEBERSICHT.md`, Abschnitt
"Appwrite-Absicherung" - ein API-Key im Browser-Code läge offen, hier in GitHub Actions nicht).
Bewusst ein SEPARATER Key vom Login-Account: nur lesende Scopes, kein Lösch-/Schreibrecht -
falls er je leaken sollte, ist der Schaden auf "Daten wurden gelesen" begrenzt, nicht "Daten
wurden gelöscht/verändert".

## Einmalige Einrichtung

### 1. Appwrite: Server-API-Key erstellen
1. Appwrite Console → dein Projekt → **Overview** → **Integrations** → **API Keys** → **Create API Key**.
2. Name z.B. "backup-readonly".
3. Scopes: NUR lesende auswählen - `tables.read` bzw. `rows.read` und `files.read` (die genaue
   Bezeichnung kann je nach Appwrite-Version leicht abweichen - im Zweifel alle mit "read" im
   Namen für Tables/Rows/Files/Buckets, NICHTS mit "write"/"delete").
4. Ablaufdatum: optional, aber ein jährliches Ablaufdatum ist eine sinnvolle zusätzliche
   Absicherung.
5. Den generierten Key als GitHub-Secret `APPWRITE_BACKUP_API_KEY` hinterlegen (Repo →
   Settings → Secrets and variables → Actions → New repository secret).

**⏰ Merken:** Der aktuell verwendete Key "backup-timesync" läuft am **01.01.2029** ab
(Nutzer-Entscheidung, 05.09.2026). Rechtzeitig vorher einen neuen Key erstellen und das
Secret aktualisieren - siehe auch `PROJEKT_UEBERSICHT.md`, Abschnitt "Offene Punkte".

### 2. Google Drive: Service-Account erstellen
1. [Google Cloud Console](https://console.cloud.google.com/) → ein Projekt anlegen (oder ein
   vorhandenes nutzen) → **APIs & Services** → **Library** → "Google Drive API" suchen und
   aktivieren.
2. **IAM & Admin** → **Service Accounts** → **Create Service Account** (Name z.B.
   "zeiterfassung-backup"). Keine besonderen Projekt-Rollen nötig.
3. Auf den neuen Service-Account klicken → Tab **Keys** → **Add Key** → **Create new key** →
   Typ **JSON** → Download.
4. Den KOMPLETTEN Inhalt der heruntergeladenen JSON-Datei als GitHub-Secret
   `GDRIVE_SERVICE_ACCOUNT_JSON` hinterlegen (den ganzen JSON-Text, nicht nur einen Ausschnitt).
5. In der heruntergeladenen JSON-Datei die Adresse im Feld `client_email` merken (sieht aus wie
   `zeiterfassung-backup@<projekt>.iam.gserviceaccount.com`).

### 3. Google Drive: Ordner freigeben
1. In deinem eigenen Google Drive einen neuen Ordner anlegen (z.B. "Zeiterfassung Backups").
2. Ordner → Rechtsklick → **Freigeben** → die `client_email`-Adresse aus Schritt 2.5 eintragen,
   Rolle **Bearbeiter (Editor)**.
3. Die Ordner-ID aus der URL kopieren (der Teil nach `/folders/` in der Browser-Adresszeile,
   z.B. `https://drive.google.com/drive/folders/`**`1AbC2dEfGhIjKlMnOpQrStUvWxYz`**).
4. Diese ID als GitHub-Secret `GDRIVE_BACKUP_FOLDER_ID` hinterlegen.

## Manuellen Testlauf anstoßen
GitHub → Actions-Tab → "Monatliches Backup (Appwrite -> Google Drive)" → **Run workflow**.
(Falls das per API mangels `actions`-Scope am geteilten Token scheitert: siehe
CLAUDE_CHECKLIST.md, Abschnitt 0, für den Branch-Workaround.)

## Was NICHT passiert
- Die Backup-Datei (`backup-output.json`, enthält echte Reisekosten-/Belegdaten) wird NIE
  committet und NIE als GitHub-Actions-Artefakt hochgeladen - beides wäre bei diesem
  öffentlichen Repo öffentlich einsehbar. Sie existiert nur kurz auf dem GitHub-Actions-Runner
  selbst (wird nach dem Job automatisch verworfen) und landet ausschließlich in deinem privaten
  Google-Drive-Ordner.
- Der Backup-API-Key hat KEINE Schreib-/Löschrechte - selbst bei einem Leak können damit keine
  Daten manipuliert oder gelöscht werden, nur gelesen.
