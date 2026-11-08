import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Bell, Briefcase, CalendarDays, CheckCircle2, ChevronRight, StickyNote } from 'lucide-react';
import { NAV_ITEMS } from '../../components/layout/Sidebar';
import type { NavTab } from '../../components/layout/BottomNav';
import { PageSkeleton } from '../../components/ui/Skeleton';
import { useNotifications } from '../../context/NotificationsContext';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/datetime';
import { triggerHaptic } from '../../lib/haptics';
import type { Job, Note, Task } from '../../types';

const DESCRIPTIONS: Record<string, string> = {
  agent: 'Ask about your saved items, or plan something new together',
  tasks: 'Plan your next steps', calendar: 'See what is coming up', wallet: 'Your cards and accounts',
  notes: 'Capture ideas and reminders', jobs: 'Explore your opportunities', commands: 'Keep useful commands handy',
  links: 'Open your saved places', email: 'Send templated emails', json: 'Inspect and format JSON', markdown: 'Write and preview Markdown',
};

/* DESIGN.md 5.2: one tone per section, used the same way everywhere on this page. */
const TONES: Record<string, string> = {
  agent: 't-violet', tasks: 't-primary', calendar: 't-violet', wallet: 't-success', notes: 't-teal',
  jobs: 't-warning', commands: 't-neutral', links: 't-rose', email: 't-primary', json: 't-neutral', markdown: 't-neutral',
};
const PRIORITY_TONES: Record<string, string> = { high: 't-error', med: 't-warning', low: 't-neutral' };

export function HomeView({ onSelectTab }: { onSelectTab: (tab: NavTab) => void }) {
  const { items: notifications, unread, open: openNotifications } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    const [taskResult, noteResult, jobResult] = await Promise.allSettled([api.tasks.list(), api.notes.list(), api.jobs.list()]);
    if (requestId.current !== current) return;
    setTasks(taskResult.status === 'fulfilled' ? taskResult.value : null);
    setNotes(noteResult.status === 'fulfilled' ? noteResult.value : null);
    setJobs(jobResult.status === 'fulfilled' ? jobResult.value : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]);

  const select = (tab: NavTab) => { triggerHaptic('light'); onSelectTab(tab); };
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const openTasks = tasks?.filter(task => !task.done) ?? [];
  const dueToday = openTasks.filter(task => task.due_at != null && task.due_at * 1000 >= todayStart.getTime() && task.due_at * 1000 < tomorrow.getTime());
  const upcoming = [...openTasks].sort((a, b) => (a.due_at ?? Number.MAX_SAFE_INTEGER) - (b.due_at ?? Number.MAX_SAFE_INTEGER) || b.updated_at - a.updated_at).slice(0, 4);
  const metrics = [
    { label: 'Open tasks', value: tasks == null ? null : openTasks.length, icon: CheckCircle2, tab: 'tasks' as NavTab, tone: 't-primary' },
    { label: 'Due today', value: tasks == null ? null : dueToday.length, icon: CalendarDays, tab: 'calendar' as NavTab, tone: 't-violet' },
    { label: 'Saved notes', value: notes?.length ?? null, icon: StickyNote, tab: 'notes' as NavTab, tone: 't-teal' },
    { label: 'New jobs', value: jobs == null ? null : jobs.filter(job => job.status === 'new').length, icon: Briefcase, tab: 'jobs' as NavTab, tone: 't-warning' },
  ];

  return (
    <div className="w-full space-y-6">
      <div className="min-w-0">
        <h2 className="title-large text-on-surface">Your daily overview</h2>
        <p className="mt-0.5 body-medium text-on-surface-variant">A little clarity for your day, and your tools close by.</p>
      </div>
      {loading ? <PageSkeleton kind="home" /> : <>
        {(tasks == null || notes == null || jobs == null) && (
          <p role="status" className="flex items-start gap-2.5 rounded-md border border-outline-variant bg-surface-container-lowest px-3.5 py-3 body-medium text-on-surface-variant">
            <AlertTriangle className="i mt-px h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>Some overview data is unavailable. Pull down to try again.</span>
          </p>
        )}
        <section aria-label="Overview summary" className="kpis">
          {metrics.map(metric => {
            const Icon = metric.icon;
            return (
              <button
                key={metric.label}
                type="button"
                onClick={() => select(metric.tab)}
                className={`kpi ${metric.tone} w-full text-left transition-[background-color,transform] duration-150 ease-spatial-fast hover:bg-state-hover active:scale-[0.98]`}
              >
                <span className="kpi-top">
                  <span className="kpi-label">{metric.label}</span>
                  <span className="shape-icon"><Icon className="i" aria-hidden="true" /></span>
                </span>
                {metric.value == null
                  ? <span className="kpi-n text-on-surface-variant"><span aria-hidden="true">—</span><span className="sr">Unavailable</span></span>
                  : <span className="kpi-n">{metric.value}</span>}
              </button>
            );
          })}
        </section>
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={openNotifications}
            className="group flex w-full items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 text-left transition-colors duration-150 ease-spatial-fast hover:bg-state-hover"
          >
            <span className="shape-icon t-warning"><Bell className="i" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block title-small text-on-surface">{notifications.length} notification{notifications.length === 1 ? '' : 's'}{unread > 0 ? `, ${unread} new` : ''}</span>
              <span className="mt-0.5 block body-medium text-on-surface-variant">Overdue tasks, reminders and what is coming up.</span>
            </span>
            <ChevronRight className="i h-4 w-4 shrink-0 text-on-surface-variant transition-colors group-hover:text-on-surface" aria-hidden="true" />
          </button>
        )}
        <section aria-labelledby="home-tools-heading">
          <h3 id="home-tools-heading" className="mb-3 title-medium text-on-surface">Explore your tools</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {NAV_ITEMS.filter(item => String(item.id) !== 'home').map(item => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => select(item.id)}
                  className={`group flex min-h-[112px] flex-col rounded-lg border border-outline-variant bg-surface-container-lowest p-4 text-left transition-[background-color,transform] duration-150 ease-spatial-fast hover:bg-state-hover active:scale-[0.98] ${item.id === 'agent' ? 'col-span-2 sm:col-span-3' : ''}`}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className={`shape-icon ${TONES[item.id] ?? 't-neutral'}`}><Icon className="i" aria-hidden="true" /></span>
                    <ArrowUpRight className="i h-4 w-4 text-on-surface-variant transition-colors group-hover:text-on-surface" aria-hidden="true" />
                  </span>
                  <span className="mt-3 block title-small text-on-surface">{item.label}</span>
                  <span className="mt-0.5 block body-small text-on-surface-variant">{DESCRIPTIONS[item.id]}</span>
                </button>
              );
            })}
          </div>
        </section>
        <section aria-labelledby="home-tasks-heading" className="panel">
          <div className="flex items-center justify-between gap-3 border-b border-outline-variant py-2.5 pl-5 pr-3">
            <h3 id="home-tasks-heading" className="title-medium text-on-surface">On your list</h3>
            <button type="button" onClick={() => select('tasks')} className="btn text xs">View all</button>
          </div>
          {tasks == null
            ? <p className="px-5 py-6 body-medium text-on-surface-variant">Tasks are unavailable. Pull down to try again.</p>
            : upcoming.length === 0
              ? <p className="px-5 py-6 body-medium text-on-surface-variant">All clear. Add a task when you have something to plan.</p>
              : (
                <div className="divide-y divide-outline-variant">
                  {upcoming.map(task => (
                    <button
                      type="button"
                      key={task.id}
                      onClick={() => select('tasks')}
                      className="group flex min-h-[56px] w-full items-center gap-3 px-5 py-3 text-left transition-colors duration-150 ease-spatial-fast hover:bg-state-hover"
                    >
                      <span className={`dot ${PRIORITY_TONES[task.priority] ?? 't-neutral'}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate title-small text-on-surface">{task.title}</span>
                        <span className="mt-0.5 block body-small text-on-surface-variant tabular">{task.due_at ? `Due ${fmtDate(task.due_at)}` : 'No deadline'}</span>
                      </span>
                      <ChevronRight className="i h-4 w-4 shrink-0 text-on-surface-variant transition-colors group-hover:text-on-surface" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
        </section>
      </>}
    </div>
  );
}
