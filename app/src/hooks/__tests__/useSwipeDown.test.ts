// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSwipeDown } from '../useSwipeDown';

function touchEvent(x: number, y: number): Partial<React.TouchEvent> {
  const touches = [{ clientX: x, clientY: y }] as unknown as React.TouchList;
  return { touches, changedTouches: touches };
}

describe('useSwipeDown', () => {
  it('erkennt eine Wisch-Geste nach unten', () => {
    const onSwipeDown = vi.fn();
    const { result } = renderHook(() => useSwipeDown(onSwipeDown));
    result.current.onTouchStart(touchEvent(200, 100) as React.TouchEvent);
    result.current.onTouchEnd(touchEvent(200, 200) as React.TouchEvent); // 100px nach unten
    expect(onSwipeDown).toHaveBeenCalledOnce();
  });

  it('ignoriert kurze Bewegungen (Tippen), unterhalb der Mindestdistanz', () => {
    const onSwipeDown = vi.fn();
    const { result } = renderHook(() => useSwipeDown(onSwipeDown));
    result.current.onTouchStart(touchEvent(200, 100) as React.TouchEvent);
    result.current.onTouchEnd(touchEvent(200, 120) as React.TouchEvent); // nur 20px
    expect(onSwipeDown).not.toHaveBeenCalled();
  });

  it('ignoriert eine Wisch-Geste nach OBEN', () => {
    const onSwipeDown = vi.fn();
    const { result } = renderHook(() => useSwipeDown(onSwipeDown));
    result.current.onTouchStart(touchEvent(200, 200) as React.TouchEvent);
    result.current.onTouchEnd(touchEvent(200, 100) as React.TouchEvent); // 100px nach oben
    expect(onSwipeDown).not.toHaveBeenCalled();
  });

  it('ignoriert überwiegend horizontale Bewegungen (zu schräg)', () => {
    const onSwipeDown = vi.fn();
    const { result } = renderHook(() => useSwipeDown(onSwipeDown));
    result.current.onTouchStart(touchEvent(100, 100) as React.TouchEvent);
    result.current.onTouchEnd(touchEvent(300, 150) as React.TouchEvent); // 200px horizontal, nur 50px vertikal
    expect(onSwipeDown).not.toHaveBeenCalled();
  });

  it('ignoriert ein touchend ohne vorheriges touchstart', () => {
    const onSwipeDown = vi.fn();
    const { result } = renderHook(() => useSwipeDown(onSwipeDown));
    result.current.onTouchEnd(touchEvent(200, 300) as React.TouchEvent);
    expect(onSwipeDown).not.toHaveBeenCalled();
  });
});
