import React, { useState, useEffect, useId } from 'react';
import { Modal } from '../../components/ui/Modal';
import { TagInput } from '../../components/ui/TagInput';
import { DateTimePicker } from '../../components/ui/DateTimePicker';
import { RecurrenceField } from '../../components/ui/RecurrenceField';
import { ReminderField, reconcileReminder } from '../../components/ui/ReminderField';
import { toEpoch, toLocalInput } from '../../lib/datetime';
import { api, humanizeError, ApiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { Task, TaskInput, Recurrence, ReminderInput } from '../../types';

const TITLE_REQUIRED = 'Enter a task title.';

/* DESIGN.md 4.6 priority tones, shown as chips (4.5) with a tone dot. */
const PRIORITY_OPTIONS: { value: 'low' | 'med' | 'high'; label: string; tone: string }[] = [
  { value: 'low', label: 'Low', tone: 't-neutral' },
  { value: 'med', label: 'Medium', tone: 't-warning' },
  { value: 'high', label: 'High', tone: 't-error' },
];

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  task?: Task | null;
  onSaved: () => void;
  knownTags?: string[];
}

export function TaskFormModal({
  isOpen,
  onClose,
  task,
  onSaved,
  knownTags = [],
}: TaskFormModalProps) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'med' | 'high'>('med');
  const [tags, setTags] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [recurrence, setRecurrence] = useState<Recurrence>({
    freq: 'none',
    interval: 1,
    byday: [],
  });
  const [reminder, setReminder] = useState<ReminderInput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const titleErrorId = `${uid}-title-error`;
  const notesId = `${uid}-notes`;
  const priorityLabelId = `${uid}-priority`;

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setPriority(task.priority || 'med');
      setTags(task.tags || []);
      setDueAt(toLocalInput(task.due_at));
      setScheduledAt(toLocalInput(task.scheduled_at));
      setRecurrence(task.recurrence || { freq: 'none', interval: 1, byday: [] });
      setReminder(
        task.reminder
          ? {
              parent_type: 'task',
              parent_id: task.id,
              lead_minutes: task.reminder.lead_minutes,
            }
          : null
      );
    } else {
      setTitle('');
      setDescription('');
      setPriority('med');
      setTags([]);
      setDueAt('');
      setScheduledAt('');
      setRecurrence({ freq: 'none', interval: 1, byday: [] });
      setReminder(null);
    }
    setError(null);
  }, [task, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // busy button (4.1): repeated submits are ignored
    if (!title.trim()) {
      setError(TITLE_REQUIRED);
      return;
    }

    setLoading(true);
    setError(null);

    const payload: TaskInput = {
      title: title.trim(),
      description: description.trim(),
      priority,
      tags,
      due_at: toEpoch(dueAt),
      scheduled_at: toEpoch(scheduledAt),
      recurrence,
    };

    try {
      const saved = task
        ? await api.tasks.update(task.id, payload)
        : await api.tasks.create(payload);

      await reconcileReminder('task', saved.id, task?.reminder, reminder, api.reminders);

      toast.success(task ? 'Task updated' : 'Task created');
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err instanceof ApiError ? humanizeError(err.code) : 'Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  // The title error sits under its field and clears as soon as a title is typed (4.22).
  const isTitleError = error === TITLE_REQUIRED;
  const titleInvalid = isTitleError && !title.trim();
  const formError = error && !isTitleError ? error : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={task ? 'Edit task' : 'New task'}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn text">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            aria-disabled={loading || undefined}
            className={`btn filled${loading ? ' is-busy' : ''}`}
          >
            <span className="loading" aria-hidden="true" />
            {loading ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="fields" aria-busy={loading || undefined}>
        <div className={`field${titleInvalid ? ' invalid' : ''}`}>
          <label htmlFor={titleId} className="field-label">
            Title
          </label>
          <input
            id={titleId}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Finish the quarterly report"
            required
            autoFocus
            aria-invalid={titleInvalid || undefined}
            aria-describedby={titleInvalid ? titleErrorId : undefined}
          />
          <p id={titleErrorId} className="field-error m-0" aria-live="polite">
            {titleInvalid ? error : ''}
          </p>
        </div>

        <div className="field">
          <label htmlFor={notesId} className="field-label">
            Notes<span className="opt"> (optional)</span>
          </label>
          <textarea
            id={notesId}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add details, steps or context…"
          />
        </div>

        <div className="field">
          <span id={priorityLabelId} className="field-label">
            Priority
          </span>
          <div role="group" aria-labelledby={priorityLabelId} className="flex flex-wrap gap-2">
            {PRIORITY_OPTIONS.map((opt) => {
              const on = priority === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPriority(opt.value)}
                  className={`chip${on ? ' on' : ''}`}
                >
                  <span className={`dot ${opt.tone}`} aria-hidden="true" />
                  <span className="chip-label">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <TagInput
          tags={tags}
          onChange={setTags}
          suggestions={knownTags}
          placeholder="work, urgent…"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateTimePicker
            label="Due date & time"
            value={dueAt}
            onChange={setDueAt}
            mode="datetime"
          />
          <DateTimePicker
            label="Start date & time (optional)"
            value={scheduledAt}
            onChange={setScheduledAt}
            mode="datetime"
          />
        </div>

        <RecurrenceField value={recurrence} onChange={setRecurrence} />
        <ReminderField value={reminder} onChange={setReminder} mode="lead" />

        {formError && (
          <p className="field-error m-0" role="alert">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
