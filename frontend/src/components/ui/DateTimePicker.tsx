import React, { useId } from 'react';

interface DateTimePickerProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  mode?: 'datetime' | 'date';
  className?: string;
  /** Marks the label "Optional" (DESIGN.md 4.22). A trailing "(optional)" in `label` does the same. */
  optional?: boolean;
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
}

/** Splits a trailing "(optional)" off a label so it renders as the 4.22 `.opt` marker. */
function splitLabel(label: string | undefined, optional?: boolean) {
  if (!label) return { text: '', opt: !!optional };
  const m = label.match(/^(.*?)\s*\(optional\)\s*$/i);
  return m ? { text: m[1], opt: true } : { text: label, opt: !!optional };
}

/** Native date / datetime input in the 4.22 text-field style (42 high, radius 12, focus ring). */
export function DateTimePicker({
  label,
  value,
  onChange,
  mode = 'datetime',
  className = '',
  optional,
  ariaLabel,
}: DateTimePickerProps) {
  const inputId = useId();
  const { text: labelText, opt } = splitLabel(label, optional);

  return (
    <div className={`field min-w-0 ${className}`}>
      {labelText && (
        <label htmlFor={inputId} className="field-label">
          {labelText}
          {opt && <span className="opt"> (optional)</span>}
        </label>
      )}
      <input
        id={inputId}
        type={mode === 'datetime' ? 'datetime-local' : 'date'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={labelText ? undefined : ariaLabel}
        className="tabular min-w-0 cursor-text text-left hover:border-on-surface-variant [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-date-and-time-value]:text-left"
      />
    </div>
  );
}
