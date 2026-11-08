import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link2, Plus, Search, Tag, ExternalLink, Pencil, Trash2, X, ChevronDown, Check } from 'lucide-react';
import { api, ApiError, humanizeError } from '../../lib/api';
import { fmtTime } from '../../lib/datetime';
import { triggerHaptic } from '../../lib/haptics';
import { safeWebsiteUrl } from '../../lib/links';
import { openExternal } from '../../lib/openExternal';
import { useToast } from '../../context/ToastContext';
import { CopyButton } from '../../components/ui/CopyButton';
import { LinkFormModal } from './LinkFormModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSkeleton } from '../../components/ui/Skeleton';
import type { Link } from '../../types';

/* ------------------------------------------------------------------ helpers */

/** DESIGN.md 4.4 / 7.2: `/` focuses the search unless typing, a modifier is held or a dialog is open. */
export function useSlashToFocus(ref: React.RefObject<HTMLInputElement>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.closest('input, textarea, select'))) return;
      if (document.querySelector('[aria-modal="true"], dialog[open]')) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}

interface TagFilterChipProps {
  tags: string[];
  value: string | null;
  onChange: (tag: string | null) => void;
  allLabel?: string;
}

/** DESIGN.md 4.5 filter chip opening a 4.18 radio menu of tags. */
export function TagFilterChip({ tags, value, onChange, allLabel = 'All tags' }: TagFilterChipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const w = menu?.offsetWidth ?? 210;
    const h = menu?.offsetHeight ?? 0;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 12 && r.top - 6 - h >= 12) top = r.top - 6 - h;
    const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
    setPos({ top, left });
  }, []);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    const checked = menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    (checked ?? items?.[0])?.focus({ preventScroll: true });
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      place();
    };
    const onResize = () => close(false);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close, place]);

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') { close(false); }
  };

  const choose = (tag: string | null) => {
    triggerHaptic('light');
    if (tag !== value) onChange(tag);
    close(true);
  };

  const options = value && !tags.includes(value) ? [value, ...tags] : tags;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`chip${value ? ' on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          triggerHaptic('light');
          setOpen((o) => !o);
        }}
      >
        <Tag className="i" aria-hidden="true" />
        <span className="chip-label">{value ?? allLabel}</span>
        <ChevronDown className="i chev" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Filter by tag"
            className="menu max-h-[min(360px,60vh)] overflow-y-auto overscroll-contain"
            style={{ top: pos.top, left: pos.left }}
            onKeyDown={onMenuKey}
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === null}
              tabIndex={-1}
              className="menu-item"
              onClick={() => choose(null)}
            >
              <span>{allLabel}</span>
              {value === null && <Check className="i tick" aria-hidden="true" />}
            </button>
            {options.length > 0 && <div role="separator" className="menu-sep" />}
            {options.map((tag) => (
              <button
                key={tag}
                type="button"
                role="menuitemradio"
                aria-checked={value === tag}
                tabIndex={-1}
                className="menu-item"
                onClick={() => choose(tag)}
              >
                <Tag className="i" aria-hidden="true" />
                <span>{tag}</span>
                {value === tag && <Check className="i tick" aria-hidden="true" />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

function fmtDay(epochSecs: number): string {
  return new Date(epochSecs * 1000).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

/* --------------------------------------------------------------------- view */

export function LinksView() {
  const toast = useToast();
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Link | null>(null);
  const [deletingItem, setDeletingItem] = useState<Link | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  useSlashToFocus(searchRef);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (selectedTag) params.set('tag', selectedTag);
      const query = params.toString() ? `?${params.toString()}` : '';

      const data = await api.links.list(query);
      setLinks(data);
    } catch (err: any) {
      toast.error(err instanceof ApiError ? humanizeError(err.code) : 'Failed to load links');
    } finally {
      setLoading(false);
    }
  }, [search, selectedTag, toast]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const handleDelete = async () => {
    if (!deletingItem) return;
    try {
      await api.links.remove(deletingItem.id);
      toast.success('Link deleted');
      setLinks((prev) => prev.filter((l) => l.id !== deletingItem.id));
    } catch {
      toast.error('Failed to delete link');
    }
  };

  const allTags = Array.from(new Set(links.flatMap((l) => l.tags || []))).sort();
  const filtered = Boolean(search || selectedTag);

  return (
    <div className="w-full">
      {/* Toolbar: search left, tag filter and the single primary action right */}
      <div className="filter-bar mt-0">
        <label className="search-bar">
          <Search className="i" aria-hidden="true" />
          <span className="sr">Search links</span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search links, domains or tags"
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
              setEditingItem(null);
              setIsFormOpen(true);
            }}
            className="btn filled create-fab ml-auto"
          >
            <Plus className="i" aria-hidden="true" />
            <span>New link</span>
          </button>
        </div>
      </div>

      {/* Links table (cards under 720) */}
      {loading ? (
        <PageSkeleton kind="links" />
      ) : links.length === 0 ? (
        <EmptyState
          icon={Link2}
          title={filtered ? 'No links match these filters' : 'No links yet'}
          hint={
            filtered
              ? 'Try a different search or tag.'
              : 'Keep track of useful websites, docs, repositories and articles.'
          }
          actionLabel="New link"
          onAction={() => setIsFormOpen(true)}
          filtered={filtered}
        />
      ) : (
        <section className="panel" aria-label="Links">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Link</th>
                  <th scope="col">Category</th>
                  <th scope="col">Tags</th>
                  <th scope="col">Updated</th>
                  <th scope="col" className="c-actions">
                    <span className="sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {links.map((item) => {
                  const href = safeWebsiteUrl(item.url);
                  const tags = item.tags || [];
                  return (
                    <tr key={item.id}>
                      <td className="c-main">
                        <div className="person-text">
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={openExternal}
                              className="name underline-offset-2 hover:underline [overflow-wrap:anywhere]"
                              aria-label={`${item.title} (opens in a new tab)`}
                            >
                              {item.title}
                            </a>
                          ) : (
                            <span className="name [overflow-wrap:anywhere]">{item.title}</span>
                          )}
                          <span className="sub" title={item.url}>
                            {domainOf(item.url)}
                          </span>
                          {item.description && (
                            <span className="src line-clamp-2 max-w-[460px] [overflow-wrap:anywhere]">
                              {item.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Category">
                        {item.category ? (
                          <span className="mini">{item.category}</span>
                        ) : (
                          <span className="muted" aria-label="Not added">—</span>
                        )}
                      </td>
                      <td data-label="Tags">
                        {tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {tags.map((t) => (
                              <span key={t} className="tag">
                                {t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="muted" aria-label="Not added">—</span>
                        )}
                      </td>
                      <td data-label="Updated">
                        <div className="when">
                          <span>{fmtDay(item.updated_at)}</span>
                          <small>{fmtTime(item.updated_at)}</small>
                        </div>
                      </td>
                      <td className="c-actions">
                        <div className="actions">
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={openExternal}
                              className="icon-btn [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
                              aria-label="Open link"
                              data-tip="Open link"
                            >
                              <ExternalLink className="i" aria-hidden="true" />
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="icon-btn [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
                              aria-disabled="true"
                              aria-label="Not a web address"
                              data-tip="Not a web address"
                            >
                              <ExternalLink className="i" aria-hidden="true" />
                            </button>
                          )}
                          <span className="inline-flex" data-tip="Copy URL">
                            <CopyButton text={item.url} ariaLabel="Copy URL" className="icon-btn [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10" />
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setEditingItem(item);
                              setIsFormOpen(true);
                            }}
                            className="icon-btn [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
                            aria-label="Edit link"
                            data-tip="Edit link"
                          >
                            <Pencil className="i" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('error');
                              setDeletingItem(item);
                            }}
                            className="icon-btn danger [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"
                            aria-label="Delete link"
                            data-tip="Delete link"
                          >
                            <Trash2 className="i" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <LinkFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingItem(null);
        }}
        linkItem={editingItem}
        onSaved={loadLinks}
        knownTags={allTags}
      />

      <ConfirmDialog
        isOpen={deletingItem !== null}
        onClose={() => setDeletingItem(null)}
        onConfirm={handleDelete}
        title="Delete this link?"
        message={`“${deletingItem?.title}” will be permanently removed.`}
        confirmLabel="Delete link"
      />
    </div>
  );
}
