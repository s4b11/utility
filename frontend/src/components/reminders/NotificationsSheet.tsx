import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AlarmClock, BellRing, Briefcase, Calendar, Check, CheckCheck, CircleAlert, Clock, CreditCard,
  ListTodo, MailWarning, StickyNote, X,
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationsContext';
import { useReminders } from '../../context/RemindersContext';
import { useBackHandler } from '../../lib/backStack';
import { fmtFull, fmtRelative } from '../../lib/datetime';
import { triggerHaptic } from '../../lib/haptics';
import type { AppNotification } from '../../types';
import type { NavTab } from '../layout/BottomNav';

function minsUntilTomorrow9(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return Math.max(1, Math.round((d.getTime() - Date.now()) / 60000));
}

/** DESIGN.md 4.25: `.closing` plays sheet-out on the default effects spring (212 ms), then unmount. */
const EXIT_MS = 220;
/** Unread dots stay a moment so the owner sees what is new, then everything shown is read. */
const MARK_READ_MS = 1500;

const FOCUSABLE =
  'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]';

const SECTIONS: { label: string; kinds: AppNotification['kind'][] }[] = [
  { label: 'Reminders', kinds: ['reminder'] },
  { label: 'Needs attention', kinds: ['task_overdue', 'card_expired', 'email_failed'] },
  { label: 'Coming up', kinds: ['task_due', 'event_soon', 'card_expiring'] },
  { label: 'Updates', kinds: ['jobs_new'] },
];

function look(n: AppNotification): { Icon: typeof Clock; tone: string } {
  switch (n.kind) {
    case 'task_overdue': return { Icon: CircleAlert, tone: 't-error' };
    case 'task_due': return { Icon: ListTodo, tone: 't-warning' };
    case 'event_soon': return { Icon: Calendar, tone: 't-violet' };
    case 'jobs_new': return { Icon: Briefcase, tone: 't-teal' };
    case 'card_expiring': return { Icon: CreditCard, tone: 't-warning' };
    case 'card_expired': return { Icon: CreditCard, tone: 't-error' };
    case 'email_failed': return { Icon: MailWarning, tone: 't-error' };
    case 'reminder':
      return { Icon: n.tab === 'tasks' ? ListTodo : n.tab === 'calendar' ? Calendar : StickyNote, tone: 't-primary' };
    default: return { Icon: BellRing, tone: 't-primary' };
  }
}

/** Card notifications are about a month, not a moment: no time line. */
const timeless = (n: AppNotification) => n.kind === 'card_expiring' || n.kind === 'card_expired';

interface NotificationsSheetProps {
  onNavigate: (tab: NavTab) => void;
}

/**
 * The notification centre behind the app bar bell (DESIGN.md 4.25 side sheet, a bottom-edge
 * full sheet on phones): due reminders with snooze / done, then overdue and upcoming work,
 * expiring cards, failed emails and new jobs. Tapping a row opens its page (and the task or
 * event itself); the close icon clears it.
 */
export function NotificationsSheet({ onNavigate }: NotificationsSheetProps) {
  const { items, unread, isOpen, close, markRead, dismiss, openItem, refresh } = useNotifications();
  const reminders = useReminders();
  const [shown, setShown] = useState(isOpen);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useBackHandler(isOpen, () => closeRef.current());
  const titleId = useId();

  // Stay mounted while the exit animation plays.
  if (isOpen && !shown) setShown(true);
  const closing = shown && !isOpen;
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => setShown(false), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  // Fresh data on open, then mark what was shown as read.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!isOpen) return;
    void refresh();
    const t = window.setTimeout(() => {
      void markRead(itemsRef.current.filter((n) => !n.read).map((n) => n.key));
    }, MARK_READ_MS);
    return () => window.clearTimeout(t);
  }, [isOpen, refresh, markRead]);

  // Modal behaviour: Escape closes, Tab is trapped, body scroll locked, focus restored.
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const wasLocked = document.body.classList.contains('overflow-hidden');
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const focusable = cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.body.classList.add('overflow-hidden');
    window.addEventListener('keydown', handleKeyDown);
    closeBtnRef.current?.focus({ preventScroll: true });
    return () => {
      if (!wasLocked) document.body.classList.remove('overflow-hidden');
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen && !shown) return null;

  const handleClose = () => {
    triggerHaptic('light');
    close();
  };

  const go = (n: AppNotification) => {
    triggerHaptic('light');
    openItem(n);
    onNavigate(n.tab as NavTab);
  };

  // Reminders are resolved through the reminders API, so they also leave the Home count.
  const afterReminder = async (action: Promise<void>) => {
    await action;
    await refresh();
  };
  const clearOne = (n: AppNotification) => {
    triggerHaptic('light');
    if (n.reminder_id != null) void afterReminder(reminders.dismiss(n.reminder_id));
    else void dismiss([n.key]);
  };
  const clearAll = async () => {
    triggerHaptic('medium');
    const rems = items.filter((n) => n.reminder_id != null);
    await dismiss(items.filter((n) => n.reminder_id == null).map((n) => n.key));
    for (const n of rems) await reminders.dismiss(n.reminder_id as number);
    if (rems.length) await refresh();
  };

  const snoozeOptions: [string, string, () => number][] = [
    ['10m', 'Snooze 10 minutes', () => 10],
    ['1h', 'Snooze 1 hour', () => 60],
    ['Tomorrow 9am', 'Snooze until tomorrow 9am', minsUntilTomorrow9],
  ];

  const sections = SECTIONS
    .map((s) => ({ ...s, list: items.filter((n) => s.kinds.includes(n.kind)) }))
    .filter((s) => s.list.length > 0);

  return (
    <div className={`modal-layer sheet ${closing ? 'closing pointer-events-none' : ''}`}>
      <div aria-hidden="true" onClick={close} className="modal-scrim" />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="side-sheet">
        <div ref={cardRef} className="sheet-card safe-pt">
          <header className="sheet-head">
            <div className="min-w-0 flex-1">
              <h2 id={titleId}>Notifications</h2>
              <p>
                {items.length === 0
                  ? 'Nothing needs your attention.'
                  : unread > 0 ? `${unread} new` : `${items.length} ${items.length === 1 ? 'notification' : 'notifications'}`}
              </p>
            </div>
            <button ref={closeBtnRef} type="button" onClick={handleClose} className="icon-btn" aria-label="Close" data-tip="Close">
              <X className="i" aria-hidden="true" />
            </button>
          </header>

          <div className="sheet-body overscroll-contain">
            {items.length === 0 ? (
              <div className="empty">
                <div className="empty-shape" aria-hidden="true"><Check className="i" /></div>
                <h3>You're all caught up</h3>
                <p>Overdue tasks, upcoming events, reminders and other updates show up here.</p>
              </div>
            ) : (
              sections.map((section) => (
                <section key={section.label} className="notif-section" aria-label={section.label}>
                  <p className="notif-section-label">{section.label}</p>
                  <ul className="list segmented">
                    {section.list.map((n) => {
                      const { Icon, tone } = look(n);
                      const isReminder = n.reminder_id != null;
                      return (
                        <li key={n.key} className={`list-item notif-item${n.read ? '' : ' unread'}`}>
                          <button type="button" className="notif-main" onClick={() => go(n)}>
                            <span className={`shape-icon round ${tone}`} aria-hidden="true"><Icon className="i" /></span>
                            <span className="li-text">
                              <span className="li-headline">
                                {!n.read && <span className="notif-dot" aria-label="New" />}
                                {n.title}
                              </span>
                              <span className="li-support tabular">
                                {n.body}
                                {!timeless(n) && <> · <time dateTime={new Date(n.at * 1000).toISOString()} title={fmtFull(n.at)}>{fmtRelative(n.at)}</time></>}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="icon-btn notif-clear"
                            onClick={() => clearOne(n)}
                            aria-label={isReminder ? `Mark reminder done: ${n.title}` : `Clear notification: ${n.title}`}
                            data-tip={isReminder ? 'Done' : 'Clear'}
                          >
                            {isReminder ? <Check className="i" aria-hidden="true" /> : <X className="i" aria-hidden="true" />}
                          </button>
                          {isReminder && (
                            <div className="notif-actions" role="group" aria-label={`Snooze ${n.title}`}>
                              {snoozeOptions.map(([text, tip, mins]) => (
                                <button
                                  key={text}
                                  type="button"
                                  onClick={() => void afterReminder(reminders.snooze(n.reminder_id as number, mins()))}
                                  className="chip has-lead"
                                  aria-label={tip}
                                  data-tip={tip}
                                >
                                  <AlarmClock className="i" aria-hidden="true" />
                                  <span className="chip-label">{text}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>

          <footer className="sheet-actions safe-pb">
            {items.length > 0 && (
              <button type="button" onClick={() => void clearAll()} className="btn text">
                <CheckCheck className="i" aria-hidden="true" />
                Clear all
              </button>
            )}
            <button type="button" onClick={handleClose} className="btn tonal">
              Close
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
