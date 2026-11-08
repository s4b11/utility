import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { TagInput } from '../../components/ui/TagInput';
import { DateTimePicker } from '../../components/ui/DateTimePicker';
import { RecurrenceField } from '../../components/ui/RecurrenceField';
import { ReminderField, reconcileReminder } from '../../components/ui/ReminderField';
import { toEpoch, toLocalInput } from '../../lib/datetime';
import { api, humanizeError, ApiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { Event, EventInput, Recurrence, ReminderInput } from '../../types';

interface EventFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  event?: Event | null;
  initialStart?: number | null;
  onSaved: () => void;
  knownTags?: string[];
}

export function EventFormModal({
  isOpen,
  onClose,
  event,
  initialStart,
  onSaved,
  knownTags = [],
}: EventFormModalProps) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<Recurrence>({
    freq: 'none',
    interval: 1,
    byday: [],
  });
  const [reminder, setReminder] = useState<ReminderInput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || '');
      setLocation(event.location || '');
      setStartAt(toLocalInput(event.start_at));
      setEndAt(toLocalInput(event.end_at));
      setAllDay(event.all_day || false);
      setTags(event.tags || []);
      setRecurrence(event.recurrence || { freq: 'none', interval: 1, byday: [] });
      setReminder(
        event.reminder
          ? {
              parent_type: 'event',
              parent_id: event.id,
              lead_minutes: event.reminder.lead_minutes,
            }
          : null
      );
    } else {
      setTitle('');
      setDescription('');
      setLocation('');
      const defaultStart = initialStart || Math.floor(Date.now() / 1000);
      setStartAt(toLocalInput(defaultStart));
      setEndAt(toLocalInput(defaultStart + 3600));
      setAllDay(false);
      setTags([]);
      setRecurrence({ freq: 'none', interval: 1, byday: [] });
      setReminder(null);
    }
    setError(null);
  }, [event, initialStart, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!title.trim()) {
      setError('A title is required.');
      return;
    }

    const s = toEpoch(startAt);
    if (s == null) {
      setError('A start date and time is required.');
      return;
    }

    let end = toEpoch(endAt);
    if (end == null) end = s + 3600;

    if (end < s) {
      setError('End time must be after start time.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload: EventInput = {
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      start_at: s,
      end_at: end,
      all_day: allDay,
      tags,
      recurrence,
    };

    try {
      const saved = event
        ? await api.events.update(event.id, payload)
        : await api.events.create(payload);

      await reconcileReminder('event', saved.id, event?.reminder, reminder, api.reminders);

      toast.success(event ? 'Event updated' : 'Event created');
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err instanceof ApiError ? humanizeError(err.code) : 'Failed to save event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={event ? 'Edit event' : 'New event'}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn text">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            aria-disabled={loading || undefined}
            className={`btn filled ${loading ? 'is-busy' : ''}`}
          >
            <span className="loading" aria-hidden="true" />
            {event ? 'Save changes' : 'Create event'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="fields" aria-busy={loading || undefined} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="event-title">
            Title
          </label>
          <input
            id="event-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Team architecture sync"
            required
            autoFocus
            aria-invalid={error === 'A title is required.' || undefined}
          />
        </div>

        <label className="check-row body-medium">
          <input
            type="checkbox"
            className="cb"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          <span>All-day event</span>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateTimePicker
            label="Start"
            value={startAt}
            onChange={setStartAt}
            mode="datetime"
          />
          <DateTimePicker
            label="End"
            value={endAt}
            onChange={setEndAt}
            mode="datetime"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="event-location">
            Location<span className="opt"> (optional)</span>
          </label>
          <input
            id="event-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Office room 3 / Google Meet"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="event-description">
            Description<span className="opt"> (optional)</span>
          </label>
          <textarea
            id="event-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Agenda, notes or links"
          />
        </div>

        <TagInput
          tags={tags}
          onChange={setTags}
          suggestions={knownTags}
          placeholder="meeting, conference..."
        />

        <RecurrenceField value={recurrence} onChange={setRecurrence} />
        <ReminderField value={reminder} onChange={setReminder} mode="lead" />

        <p className="field-error m-0" role="alert" aria-live="polite">
          {error ?? ''}
        </p>
      </form>
    </Modal>
  );
}
