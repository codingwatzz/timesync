import { useCallback, useLayoutEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'zeiterfassung-theme';

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage kann z.B. in privaten Browser-Fenstern/mit blockierten Cookies fehlschlagen -
    // dann einfach beim Standard (dark) bleiben, kein Absturz.
  }
  return 'dark';
}

/**
 * Steuert Light-/Dark-Mode über eine Klasse auf <html> (":root.light" in index.css
 * überschreibt dort dieselben Farb-Variablennamen, die @theme für Dark als Standard setzt -
 * siehe index.css-Kommentar "Design-System v2"). Präferenz wird in localStorage gemerkt,
 * damit sie über App-Neustarts hinweg erhalten bleibt (rein UI-Präferenz, kein Nutzerdaten-
 * Sync nötig - bewusst NICHT über den Appwrite-Store, das wäre für ein reines UI-Detail
 * unverhältnismäßig).
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // useLayoutEffect statt useEffect: Klasse wird VOR dem ersten sichtbaren Frame gesetzt,
  // damit es beim Umschalten nicht kurz "blitzt".
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // siehe readStoredTheme - kein Absturz, Präferenz gilt dann nur für diese Sitzung.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
