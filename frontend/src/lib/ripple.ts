/**
 * DESIGN.md 2.7 ripple: on press, a circle twice the element's diagonal grows from the
 * pointer while fading from 12% to 0 over 550 ms (the `.ripple` keyframes in m3e.css).
 * Ported from components.html; also covers the components that carry their state layer
 * without an explicit `.sl` class (see app.css).
 */
const SELECTOR = '.sl,.btn,.icon-btn,.chip,.menu-item,.fab,.fab-menu-item,.pg-num,.th-sort,.status-select,.tile';

export function installRipple() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
    if (!el || reduceMotion.matches || el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled) return;
    const r = el.getBoundingClientRect();
    const size = Math.hypot(r.width, r.height) * 2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.setAttribute('aria-hidden', 'true');
    s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    el.append(s);
    s.addEventListener('animationend', () => s.remove(), { once: true });
  });
}
