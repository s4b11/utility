import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StickyNote, Plus, Search, Pencil, Trash2, Clock, X } from 'lucide-react';
import { api, ApiError, humanizeError } from '../../lib/api';
import { fmtDate, fmtFull } from '../../lib/datetime';
import { triggerHaptic } from '../../lib/haptics';
import { useToast } from '../../context/ToastContext';
import { NoteFormModal } from './NoteFormModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ItemViewModal } from '../../components/ui/ItemViewModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { TagFilterChip, useSlashToFocus } from '../links/LinksView';
import type { Note } from '../../types';

export function NotesView() {
  const toast = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [deletingNote, setDeletingNote] = useState<Note | null>(null);
  const [viewingNote, setViewingNote] = useState<Note | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  useSlashToFocus(searchRef);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (selectedTag) params.set('tag', selectedTag);
      const query = params.toString() ? `?${params.toString()}` : '';

      const data = await api.notes.list(query);
      setNotes(data);
    } catch (err: any) {
      toast.error(err instanceof ApiError ? humanizeError(err.code) : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [search, selectedTag, toast]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleDelete = async () => {
    if (!deletingNote) return;
    try {
      await api.notes.remove(deletingNote.id);
      toast.success('Note deleted');
      setNotes((prev) => prev.filter((n) => n.id !== deletingNote.id));
    } catch {
      toast.error('Failed to delete note');
    }
  };

  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags || []))).sort();

  const filtered = Boolean(search || selectedTag);

  return (
    <div className="w-full">
      {/* Toolbar: search left, tag filter and the single primary action right */}
      <div className="filter-bar mt-0">
        <label className="search-bar">
          <Search className="i" aria-hidden="true" />
          <span className="sr">Search notes</span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes by title or content"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd aria-hidden="true">/</kbd>
          {search && (
            <button
              type="button"
              className="icon-btn search-clear"
              aria-label="Clear search"
              data-tip="Clear search"
              onClick={() => {
                setSearch('');
                searchRef.current?.focus();
              }}
            >
              <X className="i" aria-hidden="true" />
            </button>
          )}
        </label>

        <div className="filter-chips max-[720px]:w-full">
          {(allTags.length > 0 || selectedTag) && (
            <TagFilterChip tags={allTags} value={selectedTag} onChange={setSelectedTag} />
          )}
          {selectedTag && (
            <button
              type="button"
              className="btn text xs"
              onClick={() => {
                triggerHaptic('light');
                setSelectedTag(null);
              }}
            >
              Clear filters
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setEditingNote(null);
              setIsFormOpen(true);
            }}
            className="btn filled create-fab ml-auto"
          >
            <Plus className="i" aria-hidden="true" />
            <span>New note</span>
          </button>
        </div>
      </div>

      {/* Notes card grid */}
      {loading ? (
        <PageSkeleton kind="notes" />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title={filtered ? 'No notes match these filters' : 'No notes yet'}
          hint={
            filtered
              ? 'Try a different search or tag.'
              : 'Capture plain-text notes, ideas and snippets, and attach reminders.'
          }
          actionLabel="New note"
          onAction={() => setIsFormOpen(true)}
          filtered={filtered}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Notes">
          {notes.map((note) => {
            const tags = note.tags || [];
            const remindAt = note.reminder?.remind_at;
            return (
              <li
                key={note.id}
                className="relative flex min-w-0 flex-col gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 transition-colors duration-150 ease-spatial-fast hover:bg-state-hover"
              >
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 pt-1.5 title-small text-on-surface">
                    {/* Stretched button: the whole card opens the note. */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setViewingNote(note);
                      }}
                      aria-label={`View note: ${note.title}`}
                      className="rounded-sm text-left after:absolute after:inset-0 after:rounded-lg after:content-['']"
                    >
                      <span className="line-clamp-2 [overflow-wrap:anywhere]">{note.title}</span>
                    </button>
                  </h3>
                  <div className="actions relative z-[1] -mr-1.5 -mt-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setEditingNote(note);
                        setIsFormOpen(true);
                      }}
                      className="icon-btn [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
                      aria-label="Edit note"
                      data-tip="Edit note"
                    >
                      <Pencil className="i" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('error');
                        setDeletingNote(note);
                      }}
                      className="icon-btn danger [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
                      aria-label="Delete note"
                      data-tip="Delete note"
                    >
                      <Trash2 className="i" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {note.body ? (
                  <p className="line-clamp-6 whitespace-pre-wrap body-medium text-on-surface-variant [overflow-wrap:anywhere]">
                    {note.body}
                  </p>
                ) : (
                  <p className="body-medium text-on-surface-variant">No body text</p>
                )}

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="body-small text-on-surface-variant">Updated {fmtDate(note.updated_at)}</span>
                  {note.reminder && (
                    <span className="status t-primary">
                      <Clock className="i" aria-hidden="true" />
                      {remindAt ? (
                        <>
                          <span className="sr">Reminder </span>
                          {fmtFull(remindAt)}
                        </>
                      ) : (
                        'Reminder'
                      )}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ItemViewModal
        item={viewingNote}
        kind="note"
        onClose={() => setViewingNote(null)}
        onEdit={() => {
          setEditingNote(viewingNote);
          setViewingNote(null);
          setIsFormOpen(true);
        }}
      />

      <NoteFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingNote(null);
        }}
        note={editingNote}
        onSaved={loadNotes}
        knownTags={allTags}
      />

      <ConfirmDialog
        isOpen={deletingNote !== null}
        onClose={() => setDeletingNote(null)}
        onConfirm={handleDelete}
        title="Delete this note?"
        message={`“${deletingNote?.title}” will be permanently removed.`}
        confirmLabel="Delete note"
      />
    </div>
  );
}
