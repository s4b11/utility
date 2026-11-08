import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useBackHandler } from '../../lib/backStack';

interface CustomSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][]; // [value, label]
  className?: string;
  /** Marks the label "Optional" (DESIGN.md 4.22). A trailing "(optional)" in `label` does the same. */
  optional?: boolean;
  /** Leading icon inside the trigger. */
  icon?: LucideIcon;
  /** Shown in the trigger when `value` matches no option. */
  placeholder?: string;
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
}

/** Splits a trailing "(optional)" off a label so it renders as the 4.22 `.opt` marker. */
function splitLabel(label: string | undefined, optional?: boolean) {
  if (!label) return { text: '', opt: !!optional };
  const m = label.match(/^(.*?)\s*\(optional\)\s*$/i);
  return m ? { text: m[1], opt: true } : { text: label, opt: !!optional };
}

const VIEWPORT_MARGIN = 12;
const GAP = 6;

/**
 * Field-style select (DESIGN.md 4.22) whose list opens as a 4.18 menu: one `menuitemradio`
 * per option, the selected one ticked. Arrow keys, Home/End, Enter, Escape and Tab follow 4.18.
 * The menu renders in place with `position: fixed` so it also works inside modal dialogs.
 */
export function CustomSelect({
  label,
  value,
  onChange,
  options,
  className = '',
  optional,
  icon: Icon,
  placeholder = 'Select',
  ariaLabel,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  useBackHandler(open, () => setOpen(false));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const labelId = `${uid}-label`;
  const triggerId = `${uid}-trigger`;
  const menuId = `${uid}-menu`;
  const { text: labelText, opt } = splitLabel(label, optional);
  const current = options.find(([val]) => val === value);

  /** 4.18 placement: left edges align, 6 below, flip above when needed, clamp 12 inside the viewport. */
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    menu.style.minWidth = `${Math.min(r.width, vw - VIEWPORT_MARGIN * 2)}px`;
    menu.style.maxHeight = `${Math.max(120, Math.min(320, vh - VIEWPORT_MARGIN * 2))}px`;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(r.left, vw - w - VIEWPORT_MARGIN));
    let top = r.bottom + GAP;
    if (top + h > vh - VIEWPORT_MARGIN && r.top - h - GAP > VIEWPORT_MARGIN) top = r.top - h - GAP;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }, []);

  const close = useCallback((focusTrigger: boolean) => {
    flushSync(() => setOpen(false));
    if (focusTrigger) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  // Position before paint, then move focus to the checked item (else the first).
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const menu = menuRef.current;
    const target =
      menu?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ??
      menu?.querySelector<HTMLButtonElement>('.menu-item');
    target?.focus({ preventScroll: true });
  }, [open, place]);

  // Outside press closes; scroll and resize reposition.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      place();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const select = (val: string) => {
    close(true);
    onChange(val);
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('.menu-item') ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        items[(i + 1) % items.length].focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        items[(i - 1 + items.length) % items.length].focus();
        break;
      case 'Home':
        e.preventDefault();
        items[0].focus();
        break;
      case 'End':
        e.preventDefault();
        items[items.length - 1].focus();
        break;
      case 'Escape':
        // Keep the surrounding dialog open: Escape only closes this menu.
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(true);
        break;
    }
  };

  return (
    <div className={`field min-w-0 ${className}`}>
      {labelText && (
        <span id={labelId} className="field-label">
          {labelText}
          {opt && <span className="opt"> (optional)</span>}
        </span>
      )}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-labelledby={labelText ? `${labelId} ${triggerId}` : undefined}
        aria-label={labelText ? undefined : ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={`group relative flex h-[42px] w-full min-w-0 items-center gap-2.5 rounded-sm border border-outline bg-surface-container-lowest pr-[38px] text-left text-on-surface outline-none transition-[border-color,box-shadow] duration-150 ease-spatial-fast hover:border-on-surface-variant focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_var(--brand-soft)] aria-expanded:border-primary aria-expanded:shadow-[0_0_0_3px_var(--brand-soft)] aria-expanded:hover:border-primary ${
          Icon ? 'pl-3.5' : 'pl-3'
        }`}
      >
        {Icon && (
          <Icon
            className="i h-[17px] w-[17px] text-on-surface-variant transition-colors duration-150 group-focus-visible:text-primary group-aria-expanded:text-primary"
            aria-hidden="true"
          />
        )}
        <span className={`min-w-0 flex-1 truncate ${current ? '' : 'text-on-surface-variant'}`}>
          {current ? current[1] : placeholder}
        </span>
        <ChevronDown
          className="i pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant transition-transform duration-150 ease-spatial-fast group-aria-expanded:rotate-180"
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={labelText ? labelId : undefined}
          aria-label={labelText ? undefined : ariaLabel}
          onKeyDown={onMenuKeyDown}
          className="menu overflow-y-auto overscroll-contain"
        >
          {options.map(([val, text]) => {
            const checked = val === value;
            return (
              <button
                key={val}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={-1}
                onClick={() => select(val)}
                className="menu-item"
              >
                <span>{text}</span>
                {checked && <Check className="i tick" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
