import React, { useState, useEffect, useId } from 'react';
import { Modal } from '../../components/ui/Modal';
import { TagInput } from '../../components/ui/TagInput';
import { api, humanizeError, ApiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { Command, CommandInput } from '../../types';

interface CommandFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  commandItem?: Command | null;
  onSaved: () => void;
  knownTags?: string[];
}

export function CommandFormModal({
  isOpen,
  onClose,
  commandItem,
  onSaved,
  knownTags = [],
}: CommandFormModalProps) {
  const toast = useToast();
  const uid = useId();
  const ids = {
    title: `${uid}-title`,
    command: `${uid}-command`,
    category: `${uid}-category`,
    description: `${uid}-description`,
    error: `${uid}-error`,
  };
  const [title, setTitle] = useState('');
  const [command, setCommand] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (commandItem) {
      setTitle(commandItem.title);
      setCommand(commandItem.command || '');
      setDescription(commandItem.description || '');
      setCategory(commandItem.category || '');
      setTags(commandItem.tags || []);
    } else {
      setTitle('');
      setCommand('');
      setDescription('');
      setCategory('');
      setTags([]);
    }
    setError(null);
  }, [commandItem, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !command.trim()) {
      setError('Title and command text are required.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload: CommandInput = {
      title: title.trim(),
      command: command.trim(),
      description: description.trim(),
      category: category.trim(),
      tags,
    };

    try {
      if (commandItem) {
        await api.commands.update(commandItem.id, payload);
        toast.success('Command updated');
      } else {
        await api.commands.create(payload);
        toast.success('Command added');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err instanceof ApiError ? humanizeError(err.code) : 'Failed to save command');
    } finally {
      setLoading(false);
    }
  };

  // Busy submit (DESIGN.md 4.1): the button stays enabled-looking but repeated submits are ignored.
  const submit = (e: React.FormEvent) => {
    if (loading) {
      e.preventDefault();
      return;
    }
    void handleSubmit(e);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={commandItem ? 'Edit command' : 'New command'}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn text max-sm:flex-1">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            aria-disabled={loading || undefined}
            className={`btn filled max-sm:flex-1 ${loading ? 'is-busy' : ''}`}
          >
            <span className="loading" aria-hidden="true" />
            {commandItem ? 'Save changes' : 'Add command'}
          </button>
        </div>
      }
    >
      <form onSubmit={submit} aria-busy={loading || undefined} className="fields">
        <div className="field">
          <label htmlFor={ids.title} className="field-label">Title</label>
          <input
            id={ids.title}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. List git commit graph"
            required
            autoFocus
            aria-describedby={error ? ids.error : undefined}
          />
        </div>

        <div className="field">
          <label htmlFor={ids.command} className="field-label">Command</label>
          <textarea
            id={ids.command}
            rows={3}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="git log --oneline --graph -20"
            required
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            aria-describedby={error ? ids.error : undefined}
            className="font-mono body-medium"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="field">
            <label htmlFor={ids.category} className="field-label">
              Category<span className="opt"> (optional)</span>
            </label>
            <input
              id={ids.category}
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. git, docker, kubernetes"
            />
          </div>
          <TagInput
            tags={tags}
            onChange={setTags}
            suggestions={knownTags}
            placeholder="vcs, daily, ops..."
          />
        </div>

        <div className="field">
          <label htmlFor={ids.description} className="field-label">
            Description<span className="opt"> (optional)</span>
          </label>
          <textarea
            id={ids.description}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What it does, parameters..."
          />
        </div>

        {error && (
          <p id={ids.error} className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
