import { useEffect, useRef } from 'react';

/**
 * Back navigation through browser history.
 *
 * On Android the WebView's back gesture calls `history.back()` while there is history and
 * closes the app only when there is none. So every tab change and every open overlay
 * (dialog, sheet, menu, compose view, full-screen tool) adds one history entry:
 *
 *   back with an overlay open  -> the topmost overlay closes
 *   back with none open        -> the previous tab opens
 *   back on the first screen   -> the app closes, as Android users expect
 *
 * Entries carry an index so a pop can tell which overlays it passed. An overlay closed from
 * the UI leaves its entry behind: the next push reuses that slot, or, if nothing is pushed
 * right away, it is rewound. Any leftover entry a back press lands on without a visible
 * change is skipped, so every press does something. The URL never changes.
 */

type State = { app: 1; idx: number; tab?: string; overlay?: number };
type Overlay = { idx: number; onBack: () => void };

const live = new Map<number, Overlay>();
let seq = 0;
let currentIdx = 0;
let ignorePops = 0;
/** Index of a top entry whose overlay closed from the UI; the next push replaces it. */
let reusableIdx: number | null = null;
let rewindTimer: number | undefined;
let tabListener: ((tab: string) => void) | null = null;
let getTab: () => string | undefined = () => undefined;

const state = (): State | null => {
  const s = window.history.state as State | null;
  return s && s.app === 1 ? s : null;
};

function push(next: Omit<State, 'app' | 'idx'>) {
  if (reusableIdx !== null && reusableIdx === currentIdx) {
    window.clearTimeout(rewindTimer);
    reusableIdx = null;
    window.history.replaceState({ app: 1, idx: currentIdx, ...next }, '');
    return;
  }
  reusableIdx = null;
  window.clearTimeout(rewindTimer);
  currentIdx += 1;
  window.history.pushState({ app: 1, idx: currentIdx, ...next }, '');
}

function onPop(event: PopStateEvent) {
  const s = (event.state as State | null)?.app === 1 ? (event.state as State) : null;
  const landed = s?.idx ?? 0;
  if (ignorePops > 0) {
    ignorePops -= 1;
    currentIdx = landed;
    return;
  }
  window.clearTimeout(rewindTimer);
  reusableIdx = null;
  currentIdx = landed;

  // Close every open overlay whose entry is above the one we landed on (topmost first).
  const above = [...live.entries()].filter(([, o]) => o.idx > landed).sort((a, b) => b[1].idx - a[1].idx);
  if (above.length) {
    for (const [id, o] of above) {
      live.delete(id);
      o.onBack();
    }
    return;
  }
  // Otherwise show the tab this entry belongs to.
  const tab = s?.tab;
  if (tab && tab !== getTab()) {
    tabListener?.(tab);
    return;
  }
  // Nothing changed (a leftover entry): keep going back so the press is not wasted.
  if (landed > 0) window.history.back();
}

if (typeof window !== 'undefined') window.addEventListener('popstate', onPop);

/** Register the tab navigator: `current` reads the shown tab, `onTab` shows another. */
export function initTabHistory(initialTab: string, onTab: (tab: string) => void, current: () => string) {
  tabListener = onTab;
  getTab = current;
  const s = state();
  currentIdx = s?.idx ?? 0;
  window.history.replaceState({ app: 1, idx: currentIdx, tab: initialTab }, '');
  return () => {
    if (tabListener === onTab) tabListener = null;
  };
}

/** Record a new tab so back returns to the previous one. */
export function pushTab(tab: string) {
  push({ tab });
}

function open(onBack: () => void): number {
  const id = ++seq;
  push({ tab: getTab(), overlay: id });
  live.set(id, { idx: currentIdx, onBack });
  return id;
}

/** An overlay closed from the UI (not by back). */
function close(id: number) {
  const o = live.get(id);
  if (!o) return;
  live.delete(id);
  if (o.idx !== currentIdx) return; // something was pushed after it; back will skip this entry
  // Reuse the slot for an immediate push (e.g. a choice that opens another page or dialog);
  // otherwise rewind it shortly after.
  reusableIdx = o.idx;
  window.clearTimeout(rewindTimer);
  rewindTimer = window.setTimeout(() => {
    if (reusableIdx !== o.idx || currentIdx !== o.idx) return;
    reusableIdx = null;
    ignorePops += 1;
    window.history.back();
  }, 80);
}

/**
 * While `active`, the Android back gesture (or the browser back button) calls `onBack`
 * instead of leaving the screen. Use it for anything that should close on back.
 */
export function useBackHandler(active: boolean, onBack: () => void) {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    if (!active) return;
    let id = 0;
    id = open(() => {
      id = 0;
      cb.current();
    });
    return () => {
      if (id) close(id);
    };
  }, [active]);
}
