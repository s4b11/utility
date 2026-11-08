import React from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';

export interface ConnectedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface ConnectedGroupProps<T extends string> {
  value: T;
  options: ConnectedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Button size (DESIGN.md 4.1): xs 32, s 40 (default). */
  size?: 'xs' | 's';
  /** Stretch the items to fill the row. */
  block?: boolean;
  className?: string;
}

/**
 * DESIGN.md 4.3 connected button group (replaces segmented buttons): gap 2, outer corners full,
 * inner 8, pressed 4; the selected item turns fully round, fills `secondary` and slides in a
 * leading check. Single selection: `role="radiogroup"` with `role="radio"` items.
 */
export function ConnectedGroup<T extends string>({ value, options, onChange, ariaLabel, size = 's', block = false, className = '' }: ConnectedGroupProps<T>) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`connected${block ? ' flex w-full' : ''} ${className}`} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => { if (!on) { triggerHaptic('light'); onChange(o.value); } }}
            className={`btn tonal ${size}${block ? ' flex-1' : ''}`}
          >
            <Check className="i check" aria-hidden="true" />
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
