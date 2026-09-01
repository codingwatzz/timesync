# Zeiterfassung

PWA zur Erfassung von Arbeitszeiten, Homeoffice, Reisekosten und Belegen. React + TypeScript,
Appwrite als Backend, gehostet auf GitHub Pages.

**Live:** https://codingwatzz.github.io/timesync/

## Für Claude: bitte zuerst lesen

➡️ **[CLAUDE_CHECKLIST.md](./CLAUDE_CHECKLIST.md)** – verbindliche Arbeitsroutine, entstanden
aus echten Vorfällen. Vor jeder neuen Aufgabe in diesem Projekt lesen.

## Struktur

```
app/            React-Quellcode (core/store/components/hooks/lib)
test/           E2E-Tests (test/e2e/), Offline-Test
.github/workflows/   CI/CD: Build+Deploy, taeglicher E2E-Test
```

## Lokal entwickeln

```
cd app
npm install
npm run dev       # Entwicklungsserver
npm run verify    # Test + Lint + Build (vor jedem Push!)
```
