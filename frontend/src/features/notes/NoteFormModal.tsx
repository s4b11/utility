import React, { useState, useEffect, useId } from 'react';
import { Modal } from '../../components/ui/Modal';
import { TagInput } from '../../components/ui/TagInput';
import { ReminderField, reconcileReminder } from '../../components/ui/ReminderField';
import { api, humanizeError, ApiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { Note, NoteInput, ReminderInput } from '../../types';

interface NoteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  note?: Note | null;
  onSaved: () => void;
  knownTags?: string[];
}

export function NoteFormModal({
  isOpen,
  onClose,
  note,
  onSaved,
  knownTags = [],
}: NoteFormModalProps) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [reminder, setReminder] = useState<ReminderInput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setBody(note.body || '');
      setTags(note.tags || []);
      setReminder(
        note.reminder
          ? {
              parent_type: 'note',
              parent_id: note.id,
              remind_at: note.reminder.remind_at,
              lead_minutes: 0,
            }
          : null
      );
    } else {
      setTitle('');
      setBody('');
      setTags([]);
      setReminder(null);
    }
    setError(null);
  }, [note, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!title.trim()) {
      setError('A title is required.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload: NoteInput = {
      title: title.trim(),
      body: body.trim(),
      tags,
    };

    try {
      const saved = note
        ? await api.notes.update(note.id, payload)
        : await api.notes.create(payload);

      await reconcileReminder('note', saved.id, note?.reminder, reminder, api.reminders);

      toast.success(note ? 'Note updated' : 'Note created');
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err instanceof ApiError ? humanizeError(err.code) : 'Failed to save note');
    } finally {
      setLoading(false);
    }
  };

  const titleInvalid = Boolean(error) && !title.trim();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={note ? 'Edit note' : 'New note'}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn text">
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => {
              if (loading) return;
              handleSubmit(e);
            }}
            aria-disabled={loading || undefined}
            className={`btn filled${loading ? ' is-busy' : ''}`}
          >
            <span className="loading" aria-hidden="true" />
            {note ? 'Save changes' : 'Create note'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="fields" aria-busy={loading || undefined}>
        <div className={`field${titleInvalid ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor={`${uid}-title`}>Title</label>
          <input
            id={`${uid}-title`}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Quick note title"
            required
            autoFocus
            aria-invalid={titleInvalid || undefined}
            aria-describedby={error ? `${uid}-error` : undefined}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${uid}-body`}>
            Body<span className="opt"> (optional)</span>
          </label>
          <textarea
            id={`${uid}-body`}
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your note here"
          />
        </div>

        <TagInput
          tags={tags}
          onChange={setTags}
          suggestions={knownTags}
          placeholder="ideas, docs, logs..."
        />

        <ReminderField value={reminder} onChange={setReminder} mode="exact" />

        <p id={`${uid}-error`} className="field-error" aria-live="polite">
          {error}
        </p>
      </form>
    </Modal>
  );
}
