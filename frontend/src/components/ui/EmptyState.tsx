import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Plus } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
  filtered?: boolean;
  /** When `filtered`, shows a secondary button that clears the filters (DESIGN.md 4.17). */
  onClearFilters?: () => void;
  clearLabel?: string;
  /** Render only the `.empty-box` (e.g. inside an existing panel or table row) instead of a standalone panel. */
  bare?: boolean;
  className?: string;
}

/** DESIGN.md 4.19 empty state: what is missing, then the one action that fixes it (filled to
 *  create the first record, tonal to clear filters). */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  actionLabel,
  onAction,
  filtered = false,
  onClearFilters,
  clearLabel = 'Clear filters',
  bare = false,
  className = '',
}: EmptyStateProps) {
  const box = (
    <div className={`empty${bare ? ' bare' : ''}`}>
      <div className="empty-shape" aria-hidden="true">
        <Icon className="i" />
      </div>
      <h3>{title}</h3>
      <p>{hint}</p>

      {actionLabel && onAction && !filtered && (
        <button type="button" onClick={onAction} className="btn filled">
          <Plus className="i" aria-hidden="true" />
          <span>{actionLabel}</span>
        </button>
      )}
      {filtered && onClearFilters && (
        <button type="button" onClick={onClearFilters} className="btn tonal">
          {clearLabel}
        </button>
      )}
    </div>
  );

  if (bare) return <div className={className}>{box}</div>;

  return <section className={`panel ${className}`}>{box}</section>;
}
