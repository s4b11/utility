import React from 'react';
import { CircleCheck, Pencil, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { fmtFull } from '../../lib/datetime';
import type { Note, Task, Recurrence, Reminder } from '../../types';

function describeRecurrence(recurrence: Recurrence) {
  if (!recurrence || recurrence.freq === 'none') return 'Does not repeat';
  const units = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
  const interval = Math.max(1, recurrence.interval || 1);
  let description = `Every ${interval === 1 ? '' : `${interval} `}${units[recurrence.freq]}${interval > 1 ? 's' : ''}`;
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (recurrence.byday?.length) description += ` on ${recurrence.byday.map((day) => weekdays[day]).join(', ')}`;
  if (recurrence.until != null) description += ` until ${fmtFull(recurrence.until)}`;
  if (recurrence.count != null) description += ` (${recurrence.count} occurrences)`;
  return description;
}

function describeReminder(reminder?: Reminder | null) {
  if (!reminder) return 'No reminder';
  const timing = reminder.remind_at != null
    ? fmtFull(reminder.remind_at)
    : reminder.lead_minutes > 0 ? `${reminder.lead_minutes} minutes before due time` : 'At due time';
  return `${timing}${reminder.status === 'cancelled' ? ' (cancelled)' : ''}${reminder.snooze_until != null ? ` · Snoozed until ${fmtFull(reminder.snooze_until)}` : ''}`;
}

interface ItemViewModalProps {
  item: Note | Task | null;
  kind: 'note' | 'task';
  onClose: () => void;
  onEdit: () => void;
  /** Optional destructive action, shown first in the sheet footer as `btn danger-text` (DESIGN.md 4.23). */
  onDelete?: () => void;
}

/** 4.23 details sheet: read one note or task, with its actions in the footer. */
export function ItemViewModal({ item, kind, onClose, onEdit, onDelete }: ItemViewModalProps) {
  const task = item && 'done' in item ? item : null;
  const noun = kind === 'note' ? 'note' : 'task';
  const fields: [string, React.ReactNode][] = item ? [
    ...(task ? [
      ['Status', task.done
        ? <span className="status t-success"><CircleCheck className="i" aria-hidden="true" />Completed</span>
        : <span className="status t-neutral"><span className="dot" aria-hidden="true" />Open</span>],
      ['Priority', task.priority === 'med' ? 'Medium' : task.priority === 'high' ? 'High' : 'Low'],
      ['Due', task.due_at != null ? fmtFull(task.due_at) : 'No due date'],
      ['Scheduled', task.scheduled_at != null ? fmtFull(task.scheduled_at) : 'Not scheduled'],
      ['Recurrence', describeRecurrence(task.recurrence)],
    ] as [string, React.ReactNode][] : []),
    ['Reminder', describeReminder(item.reminder)],
    ['Created', fmtFull(item.created_at)],
    ['Updated', fmtFull(item.updated_at)],
  ] : [];
  const text = item ? (task ? task.description : (item as Note).body) : '';

  return (
    <Modal
      variant="sheet"
      isOpen={item !== null}
      onClose={onClose}
      title={item?.title || (kind === 'note' ? 'View note' : 'View task')}
      description={kind === 'note' ? 'Note' : 'Task'}
      footer={
        <>
          {onDelete && (
            <button type="button" onClick={onDelete} className="btn danger-text">
              <Trash2 className="i" aria-hidden="true" /> Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="btn text">Close</button>
          <button type="button" onClick={onEdit} className="btn filled">
            <Pencil className="i" aria-hidden="true" /> Edit {noun}
          </button>
        </>
      }
    >
      {item && (
        <article className="min-w-0">
          <section
            aria-label={kind === 'note' ? 'Note body' : 'Task description'}
            className={`select-text whitespace-pre-wrap break-words px-6 pt-5 leading-relaxed [overflow-wrap:anywhere] ${text ? 'text-on-surface' : 'text-on-surface-variant'}`}
          >
            {text || (task ? 'No description added.' : 'No body text added.')}
          </section>
          {(item.tags || []).length > 0 && (
            <div aria-label="Tags" className="flex flex-wrap gap-1.5 px-6 pt-4">
              {item.tags.map((tag) => <span key={tag} className="tag max-w-full"><span className="truncate">#{tag}</span></span>)}
            </div>
          )}
          <div aria-hidden="true" className="mx-6 mt-5 border-t border-outline-variant" />
          <dl className="kv">
            {fields.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </article>
      )}
    </Modal>
  );
}
