import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal, Plus, Search, Tag, Pencil, Trash2, X } from 'lucide-react';
import { api, ApiError, humanizeError } from '../../lib/api';
import { triggerHaptic } from '../../lib/haptics';
import { useToast } from '../../context/ToastContext';
import { CopyButton } from '../../components/ui/CopyButton';
import { CommandFormModal } from './CommandFormModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSkeleton } from '../../components/ui/Skeleton';
import type { Command } from '../../types';

/* Row icon buttons grow to a 40px touch target when the table collapses to cards. */
const ROW_BTN = 'max-[720px]:h-10 max-[720px]:w-10';

export function CommandsView() {
  const toast = useToast();
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Command | null>(null);
  const [deletingItem, setDeletingItem] = useState<Command | null>(null);

  const loadCommands = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (selectedTag) params.set('tag', selectedTag);
      const query = params.toString() ? `?${params.toString()}` : '';

      const data = await api.commands.list(query);
      setCommands(data);
    } catch (err: any) {
      toast.error(err instanceof ApiError ? humanizeError(err.code) : 'Failed to load commands');
    } finally {
      setLoading(false);
    }
  }, [search, selectedTag, toast]);

  useEffect(() => {
    loadCommands();
  }, [loadCommands]);

  // DESIGN.md 4.4: "/" focuses the search unless typing in a field, a modifier is held or a dialog is open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleDelete = async () => {
    if (!deletingItem) return;
    try {
      await api.commands.remove(deletingItem.id);
      toast.success('Command deleted');
      setCommands((prev) => prev.filter((c) => c.id !== deletingItem.id));
    } catch {
      toast.error('Failed to delete command');
    }
  };

  const openCreate = () => {
    triggerHaptic('light');
    setEditingItem(null);
    setIsFormOpen(true);
  };

  const allTags = Array.from(new Set(commands.flatMap((c) => c.tags || []))).sort();

  return (
    <div className="w-full space-y-4">
      {/* Toolbar: search left, the page's single primary action right (4.4, 4.12, 5.1) */}
      <div className="filter-bar my-0">
        <label className="search-bar">
          <Search className="i" aria-hidden="true" />
          <span className="sr">Search commands</span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands, flags, descriptions"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
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
          <button type="button" onClick={openCreate} className="btn filled create-fab max-[720px]:flex-1">
            <Plus className="i" aria-hidden="true" />
            <span>New command</span>
          </button>
        </div>
      </div>

      {/* Tag filter chips (4.5): active chip uses the brand-soft "on" state */}
      {allTags.length > 0 && (
        <div
          role="group"
          aria-label="Filter by tag"
          className="no-scrollbar -m-0.5 flex items-center gap-2 overflow-x-auto p-0.5 sm:flex-wrap"
        >
          <button
            type="button"
            aria-pressed={selectedTag === null}
            onClick={() => {
              triggerHaptic('light');
              setSelectedTag(null);
            }}
            className={`chip shrink-0 ${selectedTag === null ? 'on' : ''}`}
          >
            <span className="chip-label">All tags</span>
          </button>
          {allTags.map((tag) => {
            const active = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedTag(active ? null : tag);
                }}
                className={`chip shrink-0 ${active ? 'on' : ''}`}
              >
                <Tag className="i" aria-hidden="true" />
                <span className="chip-label">{tag}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Commands list: panel + data grid; rows collapse to cards under 720px (4.14) */}
      {loading ? (
        <PageSkeleton kind="commands" />
      ) : commands.length === 0 ? (
        <EmptyState
          icon={Terminal}
          title={search || selectedTag ? 'No commands match these filters' : 'No commands yet'}
          hint={
            search || selectedTag
              ? 'Try a different search or tag.'
              : 'Save your most-used CLI snippets and shell one-liners with one-click copy.'
          }
          actionLabel="Add command"
          onAction={() => setIsFormOpen(true)}
          filtered={Boolean(search || selectedTag)}
        />
      ) : (
        <section className="panel" aria-label="Commands">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Command</th>
                  <th scope="col">Category</th>
                  <th scope="col">Tags</th>
                  <th scope="col" className="c-actions">
                    <span className="sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {commands.map((item) => (
                  <tr key={item.id}>
                    <td className="c-main min-w-[180px]">
                      <span className="block break-words title-small text-on-surface">
                        {item.title}
                      </span>
                      {item.description && (
                        <span className="mt-0.5 line-clamp-2 body-medium text-on-surface-variant">
                          {item.description}
                        </span>
                      )}
                    </td>
                    <td data-label="Command" className="max-[720px]:col-span-2">
                      <pre className="max-h-36 max-w-[460px] overflow-auto whitespace-pre rounded-md bg-surface-container-high px-3 py-2 font-mono body-small text-on-surface select-text max-[720px]:max-w-none">
                        <code>{item.command}</code>
                      </pre>
                    </td>
                    <td data-label="Category">
                      {item.category ? (
                        <span className="mini">{item.category}</span>
                      ) : (
                        <span className="muted" aria-label="Not added">
                          —
                        </span>
                      )}
                    </td>
                    <td data-label="Tags">
                      {(item.tags || []).length > 0 ? (
                        <span className="flex flex-wrap gap-1.5">
                          {(item.tags || []).map((t) => (
                            <span key={t} className="tag">
                              #{t}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="muted" aria-label="Not added">
                          —
                        </span>
                      )}
                    </td>
                    <td className="c-actions">
                      <div className="actions">
                        <CopyButton text={item.command} ariaLabel="Copy command" className={`icon-btn ${ROW_BTN}`} />
                        <button
                          type="button"
                          aria-label="Edit command"
                          data-tip="Edit command"
                          onClick={() => {
                            triggerHaptic('light');
                            setEditingItem(item);
                            setIsFormOpen(true);
                          }}
                          className={`icon-btn ${ROW_BTN}`}
                        >
                          <Pencil className="i" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete command"
                          data-tip="Delete command"
                          onClick={() => {
                            triggerHaptic('error');
                            setDeletingItem(item);
                          }}
                          className={`icon-btn danger ${ROW_BTN}`}
                        >
                          <Trash2 className="i" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <CommandFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingItem(null);
        }}
        commandItem={editingItem}
        onSaved={loadCommands}
        knownTags={allTags}
      />

      <ConfirmDialog
        isOpen={deletingItem !== null}
        onClose={() => setDeletingItem(null)}
        onConfirm={handleDelete}
        title="Delete this command?"
        message={`"${deletingItem?.title}" will be permanently removed.`}
        confirmLabel="Delete command"
      />
    </div>
  );
}
