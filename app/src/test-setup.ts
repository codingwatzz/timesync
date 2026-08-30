// Erweitert Vitests expect() um DOM-spezifische Matcher wie toBeInTheDocument().
// Wird nur für Komponenten-Tests benötigt (siehe environmentMatchGlobs in vitest.config.ts),
// schadet den reinen Logik-Tests aber nicht, da der Import selbst keine DOM-Abhängigkeit hat.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Da vitest.config.ts globals:false nutzt, registriert @testing-library/react seinen
// automatischen DOM-Aufräum-Hook NICHT von selbst - ohne dies würden Elemente aus vorherigen
// Tests im DOM verbleiben und nachfolgende Text-Abfragen mehrdeutig machen.
afterEach(() => {
  cleanup();
});
