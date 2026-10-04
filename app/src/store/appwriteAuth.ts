// Appwrite-Authentifizierung (Account-API) - getrennt von appwriteStore.ts (Daten-Zugriff),
// weil es fachlich zwei verschiedene Dinge sind: HIER geht es nur um "wer bin ich" (Login/
// Session), dort um "Daten lesen/schreiben". Beide nutzen denselben Client/Endpoint/Projekt.
//
// WICHTIG (04.09.2026): Vorher lief die App komplett ohne Login (Appwrite-Tabelle/-Bucket auf
// "Any"-Rolle, jeder mit den im öffentlichen Quellcode sichtbaren IDs konnte lesen/schreiben).
// Ein Server-seitiger API-Key wäre KEINE Verbesserung gewesen - er läge genauso offen im
// Browser-Bundle wie die "Any"-Rolle selbst, nur mit potenziell weiterreichenden Rechten. Die
// einzige bei einer rein clientseitigen PWA (kein eigener Server) tatsächlich wirksame Lösung:
// echte Appwrite-Nutzer-Session (Email+Passwort), danach Tabellen-/Bucket-Berechtigungen in der
// Appwrite Console von "Any" auf "user:<eigene-id>" einschränken (siehe PROJEKT_UEBERSICHT.md,
// Abschnitt "Appwrite-Absicherung" für die nötigen manuellen Konsolen-Schritte).

import { Client, Account } from 'appwrite';

export interface AuthConfig {
  endpoint: string;
  projectId: string;
}

export function createAuthClient(config: AuthConfig): Account {
  const client = new Client().setEndpoint(config.endpoint).setProject(config.projectId);
  return new Account(client);
}

/**
 * Direktlink zum Projekt in der Appwrite-Console (für die "Projekt pausiert"-Hilfe im Login).
 * Format `/console/project-<region>-<projectId>` - nur aus einem Appwrite-Forenbeitrag
 * abgeleitet (Beispiel "project-fra-…"), nicht aus offizieller Doku; die Region wird aus dem
 * Endpoint-Hostnamen gelesen (fra.cloud.appwrite.io -> fra). Ohne Region-Subdomain Fallback
 * auf das Format ohne Region.
 */
export function appwriteConsoleUrl(endpoint: string, projectId: string): string {
  let region = '';
  try {
    const host = new URL(endpoint).hostname; // z.B. fra.cloud.appwrite.io
    const parts = host.split('.');
    if (parts.length > 3) region = parts[0];
  } catch {
    // ungültiger Endpoint -> ohne Region weiter
  }
  return `https://cloud.appwrite.io/console/project-${region ? `${region}-` : ''}${projectId}`;
}

/** Erkennt Appwrites Meldung für ein wegen Inaktivität pausiertes Free-Tier-Projekt. */
export function istProjektPausiert(message: string | null): boolean {
  return !!message && /paused due to inactivity/i.test(message);
}
