import React from 'react';
import { Bell } from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { DateTimePicker } from './DateTimePicker';
import { toEpoch, toLocalInput } from '../../lib/datetime';
import type { Reminder, ReminderInput } from '../../types';

interface ReminderFieldProps {
  value?: Reminder | ReminderInput | null;
  onChange: (value: ReminderInput | null) => void;
  mode?: 'lead' | 'exact';
}

const LEAD_OPTIONS: [string, string][] = [
  ['none', 'No reminder'],
  ['0', 'At time of event / due'],
  ['5', '5 minutes before'],
  ['10', '10 minutes before'],
  ['15', '15 minutes before'],
  ['30', '30 minutes before'],
  ['60', '1 hour before'],
  ['1440', '1 day before'],
];

export function ReminderField({
  value,
  onChange,
  mode = 'lead',
}: ReminderFieldProps) {
  const currentLead = value?.lead_minutes != null ? String(value.lead_minutes) : 'none';

  const handleLeadChange = (val: string) => {
    if (val === 'none') {
      onChange(null);
    } else {
      onChange({
        parent_type: value?.parent_type || 'task',
        parent_id: value?.parent_id || 0,
        lead_minutes: parseInt(val, 10),
      });
    }
  };

  const handleExactChange = (val: string) => {
    if (!val) {
      onChange(null);
    } else {
      onChange({
        parent_type: 'note',
        parent_id: value?.parent_id || 0,
        remind_at: toEpoch(val),
        lead_minutes: 0,
      });
    }
  };

  return mode === 'lead' ? (
    <CustomSelect
      label="Reminder"
      icon={Bell}
      value={value ? currentLead : 'none'}
      onChange={handleLeadChange}
      options={LEAD_OPTIONS}
    />
  ) : (
    <DateTimePicker
      label="Reminder"
      optional
      value={value?.remind_at != null ? toLocalInput(value.remind_at) : ''}
      onChange={handleExactChange}
      mode="datetime"
    />
  );
}

/** Reconciles and executes reminder API updates when parent item is saved */
export async function reconcileReminder(
  parentType: 'note' | 'task' | 'event',
  parentId: number,
  prevReminder: Reminder | null | undefined,
  nextInput: ReminderInput | null,
  apiRef: {
    create: (input: ReminderInput) => Promise<any>;
    cancel: (id: number) => Promise<any>;
  }
) {
  if (!nextInput && prevReminder) {
    await apiRef.cancel(prevReminder.id);
  } else if (nextInput) {
    if (!prevReminder) {
      await apiRef.create({
        ...nextInput,
        parent_type: parentType,
        parent_id: parentId,
      });
    } else if (
      prevReminder.lead_minutes !== nextInput.lead_minutes ||
      prevReminder.remind_at !== nextInput.remind_at
    ) {
      await apiRef.cancel(prevReminder.id);
      await apiRef.create({
        ...nextInput,
        parent_type: parentType,
        parent_id: parentId,
      });
    }
  }
}
