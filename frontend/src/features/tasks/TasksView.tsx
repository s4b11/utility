import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  X,
  Tag,
  Clock,
  Repeat,
  Bell,
  Pencil,
  Trash2,
  ListTodo,
  AlertCircle,
  Calendar as CalendarIcon,
  Inbox,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { api, ApiError, humanizeError } from '../../lib/api';
import { fmtDate, fmtTime, nowEpoch, startOfDay, addDays } from '../../lib/datetime';
import { triggerHaptic } from '../../lib/haptics';
import { useToast } from '../../context/ToastContext';
import { useNotifications } from '../../context/NotificationsContext';
import { TaskFormModal } from './TaskFormModal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ItemViewModal } from '../../components/ui/ItemViewModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSkeleton } from '../../components/ui/Skeleton';
import type { Task } from '../../types';

/* DESIGN.md 4.6: priority badge tones (dot badges, a simple state). */
const PRIORITY_BADGE: Record<Task['priority'], { label: string; tone: string }> = {
  high: { label: 'High', tone: 't-error' },
  med: { label: 'Medium', tone: 't-warning' },
  low: { label: 'Low', tone: 't-neutral' },
};

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function TasksView() {
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Form modal & Delete dialog state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const { pendingOpen, consumeOpen } = useNotifications();

  // A tapped notification opens its task here, even when filters hide it from the list.
  useEffect(() => {
    if (pendingOpen?.kind !== 'task') return;
    const id = pendingOpen.id;
    consumeOpen();
    api.tasks.get(id).then(setViewingTask).catch(() => toast.error('That task no longer exists.'));
  }, [pendingOpen]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (selectedTag) params.set('tag', selectedTag);
      const query = params.toString() ? `?${params.toString()}` : '';

      const data = await api.tasks.list(query);
      setTasks(data);
    } catch (err: any) {
      toast.error(err instanceof ApiError ? humanizeError(err.code) : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [search, selectedTag, toast]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleToggleDone = async (task: Task) => {
    triggerHaptic('success');
    const nextDone = !task.done;
    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: nextDone } : t)));

    try {
      await api.tasks.setDone(task.id, nextDone);
    } catch {
      // Revert on error
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !nextDone } : t)));
      toast.error('Failed to update task');
    }
  };

  const handleDelete = async () => {
    if (!deletingTask) return;
    try {
      await api.tasks.remove(deletingTask.id);
      toast.success('Task deleted');
      setTasks((prev) => prev.filter((t) => t.id !== deletingTask.id));
    } catch {
      toast.error('Failed to delete task');
    }
  };

  // Extract all unique tags
  const allTags = Array.from(new Set(tasks.flatMap((t) => t.tags || []))).sort();

  // Group tasks
  const now = nowEpoch();
  const todayEnd = Math.floor(startOfDay(addDays(new Date(), 1)).getTime() / 1000);

  const groups = {
    overdue: [] as Task[],
    today: [] as Task[],
    upcoming: [] as Task[],
    nodate: [] as Task[],
    done: [] as Task[],
  };

  tasks.forEach((t) => {
    if (t.done) groups.done.push(t);
    else if (t.due_at == null) groups.nodate.push(t);
    else if (t.due_at < now) groups.overdue.push(t);
    else if (t.due_at < todayEnd) groups.today.push(t);
    else groups.upcoming.push(t);
  });

  const groupConfigs = [
    { key: 'overdue', label: 'Overdue', icon: AlertCircle, items: groups.overdue },
    { key: 'today', label: 'Today', icon: CalendarIcon, items: groups.today },
    { key: 'upcoming', label: 'Upcoming', icon: Clock, items: groups.upcoming },
    { key: 'nodate', label: 'No date', icon: Inbox, items: groups.nodate },
    { key: 'done', label: 'Done', icon: CheckCircle2, items: groups.done },
  ] as const;

  /* DESIGN.md 4.11: KPI row derived from the groups above (one tone per group). */
  const kpis = [
    { key: 'overdue', label: 'Overdue', tone: 't-error', icon: AlertCircle, n: groups.overdue.length },
    { key: 'today', label: 'Today', tone: 't-warning', icon: CalendarIcon, n: groups.today.length },
    { key: 'upcoming', label: 'Upcoming', tone: 't-primary', icon: Clock, n: groups.upcoming.length },
    { key: 'done', label: 'Done', tone: 't-success', icon: CheckCircle2, n: groups.done.length },
  ] as const;

  const filtered = Boolean(search || selectedTag);

  const openNewTask = () => {
    triggerHaptic('light');
    setEditingTask(null);
    setIsFormOpen(true);
  };

  return (
    <div className="flex w-full flex-col gap-4">
      {/* KPI summary */}
      {(tasks.length > 0 || filtered) && (
        <section className="kpis" aria-label="Tasks summary">
          {kpis.map(({ key, label, tone, icon: KpiIcon, n }) => (
            <div key={key} className={`kpi ${tone}`}>
              <div className="kpi-top">
                <span className="kpi-label">{label}</span>
                <span className="shape-icon">
                  <KpiIcon className="i" aria-hidden="true" />
                </span>
              </div>
              <span className="kpi-n">{n}</span>
            </div>
          ))}
        </section>
      )}

      {/* Toolbar: search left, the view's single primary action right */}
      <div className="flex items-center gap-2.5">
        <label className="search-bar min-w-0">
          <Search className="i" aria-hidden="true" />
          <span className="sr">Search tasks</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks"
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              className="icon-btn search-clear"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              data-tip="Clear search"
            >
              <X className="i" aria-hidden="true" />
            </button>
          )}
        </label>

        <button type="button" onClick={openNewTask} className="btn filled create-fab ml-auto shrink-0">
          <Plus className="i" aria-hidden="true" />
          New task
        </button>
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div
          className="-mx-4 -my-1 flex items-center gap-2 overflow-x-auto px-4 py-1 no-scrollbar lg:mx-0 lg:flex-wrap lg:px-0"
          role="group"
          aria-label="Filter by tag"
        >
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setSelectedTag(null);
            }}
            aria-pressed={selectedTag === null}
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
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedTag(active ? null : tag);
                }}
                aria-pressed={active}
                className={`chip shrink-0 ${active ? 'on' : ''}`}
              >
                <Tag className="i" aria-hidden="true" />
                <span className="chip-label">{tag}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Tasks List Content */}
      {loading ? (
        <PageSkeleton kind="tasks" />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={filtered ? 'No tasks match these filters' : 'No tasks yet'}
          hint={
            filtered
              ? 'Try a different search or tag.'
              : 'Stay organized by tracking your daily to-dos and recurring goals.'
          }
          actionLabel="New task"
          onAction={() => setIsFormOpen(true)}
          filtered={filtered}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groupConfigs.map(({ key, label, icon: GroupIcon, items }) => {
            if (items.length === 0) return null;
            const headingId = `tasks-group-${key}`;
            return (
              <section key={key} className="panel" aria-labelledby={headingId}>
                {/* Group header row */}
                <header className="flex min-h-[46px] items-center gap-2 border-b border-outline-variant py-2 pl-[22px] pr-4">
                  <GroupIcon className="h-4 w-4 shrink-0 text-on-surface-variant" aria-hidden="true" />
                  <h2 id={headingId} className="m-0 flex items-baseline gap-2 title-small text-on-surface-variant">
                    {label}
                    <span className="tabular font-normal text-on-surface-variant">{items.length}</span>
                  </h2>
                </header>

                <ul className="m-0 list-none p-0">
                  {items.map((t) => {
                    const isOverdue = !t.done && t.due_at != null && t.due_at < now;
                    const prio = PRIORITY_BADGE[t.priority] ?? PRIORITY_BADGE.med;
                    const hasRecurrence = Boolean(t.recurrence && t.recurrence.freq !== 'none');
                    return (
                      <li
                        key={t.id}
                        className="flex flex-wrap items-start gap-x-3 border-b border-outline-variant py-3.5 pl-[22px] pr-3 transition-colors duration-[120ms] ease-spatial-fast last:border-b-0 hover:bg-state-hover max-sm:pl-4"
                      >
                        {/* Done toggle (4.3); the label widens the hit area to 40px */}
                        <label className="-mx-[11px] -mb-[11px] -mt-[10px] grid shrink-0 cursor-pointer place-items-center p-[11px]">
                          <input
                            type="checkbox"
                            className="cb"
                            checked={t.done}
                            onChange={() => handleToggleDone(t)}
                            aria-label="Toggle completed"
                          />
                        </label>

                        {/* Title, notes and metadata */}
                        <div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-4">
                          <div className="min-w-0 flex-1">
                            <h3
                              className={`m-0 break-words title-small [overflow-wrap:anywhere] ${
                                t.done ? 'text-on-surface-variant line-through' : 'text-on-surface'
                              }`}
                            >
                              {t.title}
                            </h3>

                            {t.description && (
                              <p className="m-0 mt-0.5 line-clamp-2 body-medium text-on-surface-variant [overflow-wrap:anywhere]">
                                {t.description}
                              </p>
                            )}

                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {/* Priority badge */}
                              <span className={`status ${prio.tone}`}>
                                <span className="dot" aria-hidden="true" />
                                <span className="sr">Priority: </span>
                                {prio.label}
                              </span>

                              {/* Recurrence */}
                              {hasRecurrence && (
                                <span className="mini">
                                  <Repeat className="i" aria-hidden="true" />
                                  {capitalize(t.recurrence.freq)}
                                </span>
                              )}

                              {/* Reminder indicator */}
                              {t.reminder && (
                                <span className="mini" data-tip="Reminder set">
                                  <Bell className="i" aria-hidden="true" />
                                  <span className="sr">Reminder set</span>
                                </span>
                              )}

                              {/* Tags */}
                              {(t.tags || []).map((tg) => (
                                <span key={tg} className="tag">
                                  #{tg}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Due date (4.9 .when) */}
                          {t.due_at != null && (
                            <div className="when mt-2 body-medium max-sm:flex-row max-sm:items-baseline max-sm:gap-1.5 sm:mt-0 sm:min-w-[104px] sm:shrink-0 sm:text-right">
                              <span
                                className={
                                  isOverdue ? '!text-error font-medium' : t.done ? '!text-on-surface-variant' : undefined
                                }
                              >
                                <span className="sr">{isOverdue ? 'Overdue, due ' : 'Due '}</span>
                                {fmtDate(t.due_at)}
                              </span>
                              <small>{fmtTime(t.due_at)}</small>
                            </div>
                          )}
                        </div>

                        {/* Row actions (4.2) */}
                        <div className="actions shrink-0 -my-[7px] max-sm:mt-2.5 max-sm:flex max-sm:w-full max-sm:basis-full max-sm:justify-end max-sm:border-t max-sm:border-dashed max-sm:border-outline-variant max-sm:pt-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setViewingTask(t);
                            }}
                            className="icon-btn "
                            aria-label={`View task: ${t.title}`}
                            data-tip="View task"
                          >
                            <Eye className="i" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setEditingTask(t);
                              setIsFormOpen(true);
                            }}
                            className="icon-btn "
                            aria-label="Edit task"
                            data-tip="Edit task"
                          >
                            <Pencil className="i" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('error');
                              setDeletingTask(t);
                            }}
                            className="icon-btn danger "
                            aria-label="Delete task"
                            data-tip="Delete task"
                          >
                            <Trash2 className="i" aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <ItemViewModal
        item={viewingTask}
        kind="task"
        onClose={() => setViewingTask(null)}
        onEdit={() => {
          setEditingTask(viewingTask);
          setViewingTask(null);
          setIsFormOpen(true);
        }}
      />

      {/* Task Create / Edit Modal */}
      <TaskFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        onSaved={loadTasks}
        knownTags={allTags}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deletingTask !== null}
        onClose={() => setDeletingTask(null)}
        onConfirm={handleDelete}
        title="Delete this task?"
        message={`“${deletingTask?.title}” will be permanently removed.`}
        confirmLabel="Delete task"
      />
    </div>
  );
}
