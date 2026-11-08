import React, { useId } from 'react';
import { DateTimePicker } from './DateTimePicker';
import { toDateInput, toEpoch } from '../../lib/datetime';
import type { Recurrence } from '../../types';

interface RecurrenceFieldProps {
  value: Recurrence;
  onChange: (value: Recurrence) => void;
}

const FREQ_OPTIONS: [string, string][] = [
  ['none', 'Never'],
  ['daily', 'Daily'],
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['yearly', 'Yearly'],
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const UNITS: Record<string, [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
  yearly: ['year', 'years'],
};

/** Coarse pointers get a 40px target; fine pointers keep the 32px 4.18 preset. */
const PRESET_TOUCH = '[@media(pointer:coarse)]:h-10';

export function RecurrenceField({ value, onChange }: RecurrenceFieldProps) {
  const isRecurring = value.freq !== 'none';
  const uid = useId();
  const labelId = `${uid}-label`;
  const daysLabelId = `${uid}-days`;
  const intervalId = `${uid}-interval`;
  const countId = `${uid}-count`;
  const interval = value.interval || 1;
  const unit = UNITS[value.freq] ?? UNITS.yearly;

  const setFreq = (freq: string) => {
    onChange({
      ...value,
      freq: freq as Recurrence['freq'],
      interval: value.interval || 1,
      byday: value.byday || [],
    });
  };

  const toggleDay = (dayIndex: number) => {
    const cur = value.byday || [];
    const next = cur.includes(dayIndex)
      ? cur.filter((d) => d !== dayIndex)
      : [...cur, dayIndex].sort((a, b) => a - b);
    onChange({ ...value, byday: next });
  };

  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-0 flex-col gap-[7px]">
      <span id={labelId} className="field-label">
        Repeat
      </span>

      {/* Frequency presets (4.18 presets) */}
      <div className="presets mb-0">
        {FREQ_OPTIONS.map(([freq, text]) => {
          const on = value.freq === freq;
          return (
            <button
              key={freq}
              type="button"
              aria-pressed={on}
              onClick={() => setFreq(freq)}
              className={`chip ${PRESET_TOUCH} ${on ? 'on' : ''}`}
            >
              {text}
            </button>
          );
        })}
      </div>

      {isRecurring && (
        <div className="mt-2 grid gap-4 rounded-sm border border-outline-variant p-4">
          {/* Interval */}
          <div className="flex flex-wrap items-center gap-2.5 text-on-surface-variant">
            <label htmlFor={intervalId}>Every</label>
            <input
              id={intervalId}
              type="number"
              inputMode="numeric"
              min="1"
              max="99"
              value={interval}
              onChange={(e) =>
                onChange({ ...value, interval: Math.max(1, parseInt(e.target.value) || 1) })
              }
              className="input tabular h-[42px] w-20 px-3 text-center transition-[border-color,box-shadow] duration-150 ease-spatial-fast hover:border-on-surface-variant focus:border-primary"
            />
            <span>{interval === 1 ? unit[0] : unit[1]}</span>
          </div>

          {/* Weekly days selection */}
          {value.freq === 'weekly' && (
            <div className="flex flex-col gap-[7px]">
              <span id={daysLabelId} className="field-label">
                Repeat on
              </span>
              <div role="group" aria-labelledby={daysLabelId} className="presets mb-0">
                {WEEKDAYS.map((name, idx) => {
                  const active = (value.byday || []).includes(idx);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={active}
                      aria-label={WEEKDAY_NAMES[idx]}
                      onClick={() => toggleDay(idx)}
                      className={`chip min-w-[48px] px-2.5 ${PRESET_TOUCH} ${active ? 'on' : ''}`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ends options */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DateTimePicker
              label="Until"
              optional
              mode="date"
              value={toDateInput(value.until)}
              onChange={(val) => onChange({ ...value, until: toEpoch(val ? `${val}T23:59:59` : null) })}
            />
            <div className="field min-w-0">
              <label htmlFor={countId} className="field-label">
                Count limit
                <span className="opt"> (optional)</span>
              </label>
              <input
                id={countId}
                type="number"
                inputMode="numeric"
                min="1"
                placeholder="e.g. 10 times"
                value={value.count || ''}
                onChange={(e) =>
                  onChange({
                    ...value,
                    count: e.target.value ? parseInt(e.target.value) || null : null,
                  })
                }
                className="tabular hover:border-on-surface-variant"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
