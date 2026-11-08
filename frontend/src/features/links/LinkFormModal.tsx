import React, { useState, useEffect, useId } from 'react';
import { Modal } from '../../components/ui/Modal';
import { TagInput } from '../../components/ui/TagInput';
import { api, humanizeError, ApiError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import type { Link, LinkInput } from '../../types';

interface LinkFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  linkItem?: Link | null;
  onSaved: () => void;
  knownTags?: string[];
}

export function LinkFormModal({
  isOpen,
  onClose,
  linkItem,
  onSaved,
  knownTags = [],
}: LinkFormModalProps) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  useEffect(() => {
    if (linkItem) {
      setTitle(linkItem.title);
      setUrl(linkItem.url || '');
      setDescription(linkItem.description || '');
      setCategory(linkItem.category || '');
      setTags(linkItem.tags || []);
    } else {
      setTitle('');
      setUrl('');
      setDescription('');
      setCategory('');
      setTags([]);
    }
    setError(null);
  }, [linkItem, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!title.trim() || !url.trim()) {
      setError('Title and URL are required.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload: LinkInput = {
      title: title.trim(),
      url: url.trim(),
      description: description.trim(),
      category: category.trim(),
      tags,
    };

    try {
      if (linkItem) {
        await api.links.update(linkItem.id, payload);
        toast.success('Link updated');
      } else {
        await api.links.create(payload);
        toast.success('Link added');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err instanceof ApiError ? humanizeError(err.code) : 'Failed to save link');
    } finally {
      setLoading(false);
    }
  };

  const titleInvalid = Boolean(error) && !title.trim();
  const urlInvalid = Boolean(error) && !url.trim();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={linkItem ? 'Edit link' : 'New link'}
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
            {linkItem ? 'Save changes' : 'Add link'}
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
            placeholder="e.g. GitHub dashboard"
            required
            autoFocus
            aria-invalid={titleInvalid || undefined}
            aria-describedby={error ? `${uid}-error` : undefined}
          />
        </div>

        <div className={`field${urlInvalid ? ' invalid' : ''}`}>
          <label className="field-label" htmlFor={`${uid}-url`}>URL</label>
          <input
            id={`${uid}-url`}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com"
            required
            className="font-mono body-medium"
            aria-invalid={urlInvalid || undefined}
            aria-describedby={error ? `${uid}-error` : undefined}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-category`}>
              Category<span className="opt"> (optional)</span>
            </label>
            <input
              id={`${uid}-category`}
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Dev, News, Reference"
            />
          </div>
          <TagInput
            tags={tags}
            onChange={setTags}
            suggestions={knownTags}
            placeholder="bookmarks, daily..."
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${uid}-description`}>
            Description<span className="opt"> (optional)</span>
          </label>
          <textarea
            id={`${uid}-description`}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes or description"
          />
        </div>

        <p id={`${uid}-error`} className="field-error" aria-live="polite">
          {error}
        </p>
      </form>
    </Modal>
  );
}
