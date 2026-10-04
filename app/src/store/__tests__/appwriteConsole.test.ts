import { describe, it, expect } from 'vitest';
import { appwriteConsoleUrl, istProjektPausiert } from '../appwriteAuth';

describe('appwriteConsoleUrl', () => {
  it('baut den Direktlink mit Region aus dem Endpoint', () => {
    expect(appwriteConsoleUrl('https://fra.cloud.appwrite.io/v1', 'abc123'))
      .toBe('https://cloud.appwrite.io/console/project-fra-abc123');
  });
  it('lässt die Region weg, wenn der Endpoint keine hat', () => {
    expect(appwriteConsoleUrl('https://cloud.appwrite.io/v1', 'abc123'))
      .toBe('https://cloud.appwrite.io/console/project-abc123');
  });
  it('überlebt einen ungültigen Endpoint', () => {
    expect(appwriteConsoleUrl('kein url', 'abc123')).toBe('https://cloud.appwrite.io/console/project-abc123');
  });
});

describe('istProjektPausiert', () => {
  it('erkennt Appwrites Pause-Meldung', () => {
    expect(istProjektPausiert('Project is paused due to inactivity. Please restore it from the console to resume operations.')).toBe(true);
  });
  it('ist false bei anderen Fehlern und null', () => {
    expect(istProjektPausiert('Invalid credentials')).toBe(false);
    expect(istProjektPausiert(null)).toBe(false);
  });
});
