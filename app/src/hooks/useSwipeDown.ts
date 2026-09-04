import { useRef } from 'react';

// Mindest-Abwärtsbewegung in Pixeln, damit ein normales Tippen nicht versehentlich als
// Wisch-Geste gilt.
const SWIPE_DOWN_THRESHOLD_PX = 50;
// Horizontale Bewegung darf höchstens diesen Anteil der vertikalen betragen, sonst gilt die
// Geste als zu schräg (kein sauberes "nach unten") und wird ignoriert.
const SWIPE_DOWN_MAX_HORIZONTAL_RATIO = 0.6;

interface SwipeDownHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

/**
 * Erkennt eine Wisch-Geste nach UNTEN auf Touch-Geräten (z.B. am Sheet-Griff, um das
 * Detail-Sheet zu schließen - gängiges Muster aus iOS/Android-Bottom-Sheets). Bewusst als
 * eigener, separater Hook von useSwipe (horizontal) - beide auf demselben Element zu
 * kombinieren würde die jeweils andere Richtung stören; stattdessen wird dieser Hook gezielt
 * nur auf den kleinen Griff-Bereich angewendet, nicht auf das ganze Sheet.
 */
export function useSwipeDown(onSwipeDown: () => void): SwipeDownHandlers {
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
    if (dy < SWIPE_DOWN_THRESHOLD_PX) return; // nicht weit genug (oder nach oben) bewegt
    if (Math.abs(dx) > dy * SWIPE_DOWN_MAX_HORIZONTAL_RATIO) return; // zu schräg, kein "nach unten"
    onSwipeDown();
  }

  return { onTouchStart, onTouchEnd };
}
