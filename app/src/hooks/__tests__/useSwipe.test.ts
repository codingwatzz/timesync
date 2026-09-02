// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSwipe } from '../useSwipe';

function touchEvent(x: number, y: number): Partial<React.TouchEvent> {
  const touches = [{ clientX: x, clientY: y }] as unknown as React.TouchList;
  return { touches, changedTouches: touches };
}

describe('useSwipe', () => {
  it('erkennt eine Wisch-Geste nach links (onSwipeLeft)', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() => useSwipe(onSwipeLeft, onSwipeRight));
    result.current.onTouchStart(touchEvent(300, 200) as React.TouchEvent);
    result.current.onTouchEnd(touchEvent(150, 200) as React.TouchEvent); // 150px nach links
    expect(onSwipeLeft).toHaveBeenCalledOnce();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('erkennt eine Wisch-Geste nach rechts (onSwipeRight)', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() => useSwipe(onSwipeLeft, onSwipeRight));
    result.current.onTouchStart(touchEvent(100, 200) as React.TouchEvent);
    result.current.onTouchEnd(touchEvent(250, 200) as React.TouchEvent); // 150px nach rechts
    expect(onSwipeRight).toHaveBeenCalledOnce();
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('ignoriert kurze Bewegungen (Tippen), unterhalb der Mindestdistanz', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() => useSwipe(onSwipeLeft, onSwipeRight));
    result.current.onTouchStart(touchEvent(200, 200) as React.TouchEvent);
    result.current.onTouchEnd(touchEvent(215, 200) as React.TouchEvent); // nur 15px
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('ignoriert überwiegend vertikale Bewegungen (Scrollen)', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() => useSwipe(onSwipeLeft, onSwipeRight));
    result.current.onTouchStart(touchEvent(200, 100) as React.TouchEvent);
    result.current.onTouchEnd(touchEvent(280, 400) as React.TouchEvent); // 80px horizontal, 300px vertikal
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });
});
