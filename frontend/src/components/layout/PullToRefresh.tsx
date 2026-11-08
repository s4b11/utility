import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';

/**
 * A pull only belongs to the page itself: not to a dialog, sheet or menu (they render inside
 * the scroll container), not while one is open, and not inside any inner scroll area that is
 * scrolled down (dragging down there scrolls it back up).
 */
function startsOnPage(target: EventTarget | null, root: HTMLElement): boolean {
  if (document.body.classList.contains('overflow-hidden')) return false;
  let node = target instanceof Element ? target : null;
  if (node?.closest('.modal-layer, [role="dialog"], [role="menu"], .menu')) return false;
  while (node && node !== root) {
    if (node.scrollTop > 0) return false;
    node = node.parentElement;
  }
  return true;
}

/** Pull distance (px, after resistance) that arms a refresh on release. */
const THRESHOLD = 72;
/** Furthest the indicator can be dragged. */
const MAX_PULL = 120;
/** Keep the spinner up at least this long so a fast reload still reads as a refresh. */
const MIN_SPIN_MS = 600;

export type PullState = { pull: number; refreshing: boolean };

/**
 * Touch pull-to-refresh for a scroll container. Pulling down while the container is
 * scrolled to the top drags an indicator; releasing past THRESHOLD runs `onRefresh`
 * and keeps the spinner up until its promise settles. Mouse/desktop input is untouched.
 */
export function usePullToRefresh(
  ref: React.RefObject<HTMLElement>,
  onRefresh: () => Promise<void>,
  enabled: boolean,
): PullState {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const busy = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let startY = 0;
    let startX = 0;
    let tracking = false;
    let dragging = false;
    let armed = false;
    let current = 0;

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || el.scrollTop > 0 || !startsOnPage(e.target, el)) {
        tracking = false;
        return;
      }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      tracking = true;
      dragging = false;
      armed = false;
      current = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      if (!dragging) {
        // Only claim clearly vertical, downward drags that start at the top.
        if (Math.abs(dy) < 6) return;
        if (dy < 0 || Math.abs(dx) > Math.abs(dy) || el.scrollTop > 0) {
          tracking = false;
          return;
        }
        dragging = true;
      }
      if (dy <= 0) {
        current = 0;
        setPull(0);
        return;
      }
      if (e.cancelable) e.preventDefault(); // stop the page bounce while we own the gesture
      current = Math.min(MAX_PULL, dy * 0.5);
      if (current >= THRESHOLD && !armed) {
        armed = true;
        triggerHaptic('light');
      } else if (current < THRESHOLD && armed) {
        armed = false;
      }
      setPull(current);
    };

    const onEnd = async () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      if (current < THRESHOLD) {
        setPull(0);
        return;
      }
      busy.current = true;
      setRefreshing(true);
      setPull(THRESHOLD);
      const started = Date.now();
      try {
        await refreshRef.current();
      } finally {
        const left = MIN_SPIN_MS - (Date.now() - started);
        if (left > 0) await new Promise((r) => window.setTimeout(r, left));
        triggerHaptic('success');
        setRefreshing(false);
        setPull(0);
        busy.current = false;
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, enabled]);

  return { pull, refreshing };
}

/** Slides down under the app bar while pulling; the contained loading indicator while refreshing. */
export function PullIndicator({ pull, refreshing }: PullState) {
  const visible = pull > 0 || refreshing;
  const progress = Math.min(1, pull / THRESHOLD);
  const ready = progress >= 1;
  return (
    <div
      aria-hidden={!refreshing}
      role={refreshing ? 'status' : undefined}
      aria-label={refreshing ? 'Refreshing' : undefined}
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
      style={{
        transform: `translateY(${visible ? Math.max(8, pull - 32) : -56}px)`,
        opacity: visible ? Math.max(0.35, progress) : 0,
        transition: pull > 0 && !refreshing ? 'none' : 'transform var(--md-sys-motion-spatial-default), opacity var(--md-sys-motion-effects-fast)',
      }}
    >
      {refreshing ? (
        /* DESIGN.md 4.20 contained loading indicator */
        <span className="loading contained shadow-3" />
      ) : (
        <span className="pull-ind">
          <ArrowDown
            className="i"
            style={{
              transform: `rotate(${ready ? 180 : progress * 150}deg)`,
              transition: 'transform var(--md-sys-motion-spatial-fast)',
            }}
          />
        </span>
      )}
    </div>
  );
}
