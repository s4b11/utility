import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import type { AppNotification } from '../types';

/**
 * In-app notifications (no push service). The server works out what needs attention from the
 * stored data; the app polls while open, shows a snackbar when something new arrives, and lists
 * everything in the notifications sheet behind the app bar bell.
 */

const POLL_MS = 60_000;
/** Let the launch screen and the sign-in snackbar pass before the first alert. */
const FIRST_POLL_MS = 1_500;
const ALERTED_KEY = 'utility_notified_keys';
const ALERTED_MAX = 300;

/** An item a view should open once it is shown (from a tapped notification). */
export type PendingOpen = { kind: 'task' | 'event'; id: number; title: string; at: number };

interface NotificationsContextType {
  items: AppNotification[];
  unread: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  refresh: () => Promise<void>;
  markRead: (keys: string[]) => Promise<void>;
  dismiss: (keys: string[]) => Promise<void>;
  /** Close the sheet and remember the item for its view; the caller switches tab. */
  openItem: (n: AppNotification) => void;
  pendingOpen: PendingOpen | null;
  consumeOpen: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | null>(null);

/** Short label for the snackbar: "Overdue: Pay rent". */
export function kindLabel(kind: AppNotification['kind']): string {
  switch (kind) {
    case 'task_overdue': return 'Overdue';
    case 'task_due': return 'Due soon';
    case 'event_soon': return 'Coming up';
    case 'reminder': return 'Reminder';
    case 'jobs_new': return 'Jobs';
    case 'card_expiring': return 'Card expiring';
    case 'card_expired': return 'Card expired';
    case 'email_failed': return 'Email';
    default: return 'Notification';
  }
}

function loadAlerted(): Set<string> {
  try {
    const raw = localStorage.getItem(ALERTED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveAlerted(set: Set<string>) {
  try {
    localStorage.setItem(ALERTED_KEY, JSON.stringify([...set].slice(-ALERTED_MAX)));
  } catch { /* ignore */ }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null);
  const alerted = useRef<Set<string>>(loadAlerted());
  const openRef = useRef(isOpen);
  openRef.current = isOpen;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const refresh = useCallback(async () => {
    if (!session) return;
    let list: AppNotification[];
    try {
      list = (await api.notifications.list()).items;
    } catch {
      return;
    }
    setItems(list);
    // Alert once per notification: new and unread, not already shown in a snackbar.
    const fresh = list.filter((n) => !n.read && !alerted.current.has(n.key));
    if (!fresh.length) return;
    fresh.forEach((n) => alerted.current.add(n.key));
    saveAlerted(alerted.current);
    if (openRef.current) return;
    const message = fresh.length === 1
      ? `${kindLabel(fresh[0].kind)}: ${fresh[0].title}`
      : `${fresh.length} new notifications`;
    toastRef.current.info(message, { action: 'View', onAction: () => setIsOpen(true) });
  }, [session]);

  useEffect(() => {
    if (!session) {
      setItems([]);
      return;
    }
    const first = window.setTimeout(refresh, FIRST_POLL_MS);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session, refresh]);

  const markRead = useCallback(async (keys: string[]) => {
    if (!keys.length) return;
    const set = new Set(keys);
    setItems((prev) => prev.map((n) => (set.has(n.key) ? { ...n, read: true } : n)));
    try { await api.notifications.read(keys); } catch { /* retried on the next open */ }
  }, []);

  const dismiss = useCallback(async (keys: string[]) => {
    if (!keys.length) return;
    const set = new Set(keys);
    setItems((prev) => prev.filter((n) => !set.has(n.key)));
    try {
      await api.notifications.dismiss(keys);
    } catch {
      toastRef.current.error('Could not clear the notification. Try again.');
      void refresh();
    }
  }, [refresh]);

  const openItem = useCallback((n: AppNotification) => {
    if (!n.read) void markRead([n.key]);
    setIsOpen(false);
    if (n.item_id == null) return;
    if (n.tab === 'tasks') setPendingOpen({ kind: 'task', id: n.item_id, title: n.title, at: n.at });
    else if (n.tab === 'calendar') setPendingOpen({ kind: 'event', id: n.item_id, title: n.title, at: n.at });
  }, [markRead]);

  const value = useMemo<NotificationsContextType>(() => ({
    items,
    unread: items.filter((n) => !n.read).length,
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((v) => !v),
    refresh,
    markRead,
    dismiss,
    openItem,
    pendingOpen,
    consumeOpen: () => setPendingOpen(null),
  }), [items, isOpen, refresh, markRead, dismiss, openItem, pendingOpen]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
