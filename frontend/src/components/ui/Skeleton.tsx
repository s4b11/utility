import React from 'react';
import { cn } from '../../lib/utils';

/** A quiet placeholder block on `surface-container-high` (thumbnails, inline values). */
export function Skeleton({ className = 'h-16 w-full' }: { className?: string }) {
  return <div aria-hidden="true" className={cn('rounded-md bg-surface-container-high', className)} />;
}

export type SkeletonKind = 'home' | 'tasks' | 'notes' | 'commands' | 'links' | 'wallet' | 'jobs' | 'calendar' | 'agenda' | 'detail' | 'tool' | 'auth' | 'webhook';

/**
 * Page and panel waits use the DESIGN.md 4.20 loading indicator (waits under about five
 * seconds), centred where the content will appear, with one spoken status.
 */
export function PageSkeleton({ kind, label }: { kind: SkeletonKind; label?: string }) {
  const text = label || `Loading ${kind === 'detail' ? 'details' : kind === 'tool' ? 'preview' : kind}…`;
  const compact = kind === 'detail' || kind === 'auth' || kind === 'webhook' || kind === 'tool';
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={`page-loading grid place-items-center ${compact ? 'py-10' : 'py-16'}`}>
      <span className="sr">{text}</span>
      <div className="loading" role="progressbar" aria-label={text} />
    </div>
  );
}

export function CardSkeletonList({ count: _count = 4 }: { count?: number }) {
  return <PageSkeleton kind="tasks" label="Loading content…" />;
}
