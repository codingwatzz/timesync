import { useRef } from 'react';

// Mindestbewegung in Pixeln, damit ein normales Tippen nicht versehentlich als Swipe gilt.
const SWIPE_THRESHOLD_PX = 70;
// Vertikale Bewegung darf höchstens diesen Anteil der horizontalen betragen, sonst gilt die
// Geste als Scrollen (vertikal) statt als Swipe (horizontal) und wird ignoriert.
const SWIPE_MAX_VERTICAL_RATIO = 0.5;

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

/**
 * Erkennt horizontale Wisch-Gesten auf Touch-Geräten. Wertet erst bei touchend aus (kein
 * preventDefault auf touchmove), damit normales vertikales Scrollen in der Monatsliste bzw.
 * im Detail-Sheet nicht blockiert wird.
 *
 * @param onSwipeLeft  Finger bewegt sich nach links (Geste zeigt "weiter/nächstes")
 * @param onSwipeRight Finger bewegt sich nach rechts (Geste zeigt "zurück/voriges")
 */
export function useSwipe(onSwipeLeft: () => void, onSwipeRight: () => void): SwipeHandlers {
  const start = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    start.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const from = start.current;
    start.current = null;
    if (!from) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (Math.abs(dy) > Math.abs(dx) * SWIPE_MAX_VERTICAL_RATIO) return;
    if (dx < 0) onSwipeLeft(); else onSwipeRight();
  }

  return { onTouchStart, onTouchEnd };
}
