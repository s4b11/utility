import { useEffect, useRef } from 'react';

/**
 * DESIGN.md 4.22 plain tooltip, one shared instance for every element with `data-tip`.
 * Shows on mouse pointer-over and keyboard focus-visible; hides on press, focus out,
 * scroll, or leaving to an element without a tip. Touch never shows it.
 * Placement: centred 4 px above (below when no room); 8 px to the right on the rail,
 * none in the expanded rail; clamped 8 px inside the viewport. Shown in the top layer.
 */
export function TooltipHost() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    let anchor: HTMLElement | null = null;

    const hide = () => {
      anchor = null;
      tip.classList.remove('show');
    };
    const place = (el: HTMLElement) => {
      const text = el.getAttribute('data-tip');
      if (!text || el.closest('.rail.expanded')) return hide();
      anchor = el;
      tip.textContent = text;
      try { if (tip.matches(':popover-open')) tip.hidePopover(); tip.showPopover(); } catch { /* no popover API */ }
      const r = el.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x: number;
      let y: number;
      if (el.getAttribute('data-tip-side') === 'right' || el.closest('.rail')) {
        x = r.right + 8;
        y = r.top + r.height / 2 - t.height / 2;
      } else {
        x = r.left + r.width / 2 - t.width / 2;
        y = r.top - t.height - 4;
        if (y < 8) y = r.bottom + 4;
      }
      x = Math.max(8, Math.min(x, vw - t.width - 8));
      y = Math.max(8, Math.min(y, vh - t.height - 8));
      tip.style.left = `${Math.round(x)}px`;
      tip.style.top = `${Math.round(y)}px`;
      tip.classList.add('show');
    };
    const target = (e: Event) => (e.target instanceof Element ? (e.target.closest('[data-tip]') as HTMLElement | null) : null);

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = target(e);
      if (el) { if (el !== anchor) place(el); } else hide();
    };
    const onFocus = (e: FocusEvent) => {
      const el = target(e);
      if (el && el.matches(':focus-visible')) place(el);
    };
    const onMutate = () => { if (anchor) { if (!anchor.isConnected) hide(); else place(anchor); } };
    const mo = new MutationObserver(onMutate);
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-tip'] });

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      mo.disconnect();
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);

  return <div ref={ref} className="tip" role="tooltip" aria-hidden="true" {...{ popover: 'manual' }} />;
}
