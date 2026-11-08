import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { fmtRelative } from '../lib/datetime';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import type { DueReminder } from '../types';

interface RemindersContextType {
  due: DueReminder[];
  snooze: (id: number, minutes: number) => Promise<void>;
  dismiss: (id: number) => Promise<void>;
  cancel: (id: number) => Promise<void>;
  refreshDue: () => Promise<void>;
}

const RemindersContext = createContext<RemindersContextType | null>(null);

export function RemindersProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const toast = useToast();
  const [due, setDue] = useState<DueReminder[]>([]);
  const [notifiedIds, setNotifiedIds] = useState<Set<number>>(new Set());

  const refreshDue = useCallback(async () => {
    if (!session) return;
    try {
      const items = await api.reminders.due();
      setDue(items);

      // Trigger Web Notifications if granted
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        document.visibilityState === 'visible'
      ) {
        items.forEach((item) => {
          if (!notifiedIds.has(item.reminder_id)) {
            setNotifiedIds((prev) => new Set(prev).add(item.reminder_id));
            try {
              const n = new Notification(item.parent_title || 'Reminder', {
                body: `Due ${fmtRelative(item.fire_at)}`,
                tag: `rem-${item.reminder_id}`,
              });
              n.onclick = () => {
                window.focus();
                n.close();
              };
            } catch {}
          }
        });
      }
    } catch {}
  }, [session, notifiedIds]);

  useEffect(() => {
    if (!session) {
      setDue([]);
      return;
    }

    refreshDue();
    const interval = setInterval(refreshDue, 60000); // 1 minute poll

    const onFocus = () => refreshDue();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [session, refreshDue]);

  const snooze = async (id: number, minutes: number) => {
    try {
      await api.reminders.snooze(id, minutes);
      toast.success('Snoozed');
      await refreshDue();
    } catch {
      toast.error('Failed to snooze');
    }
  };

  const dismiss = async (id: number) => {
    try {
      await api.reminders.dismiss(id);
      toast.success('Dismissed');
      await refreshDue();
    } catch {
      toast.error('Failed to dismiss');
    }
  };

  const cancel = async (id: number) => {
    try {
      await api.reminders.cancel(id);
      toast.success('Reminder cancelled');
      await refreshDue();
    } catch {
      toast.error('Failed to cancel');
    }
  };

  return (
    <RemindersContext.Provider
      value={{
        due,
        snooze,
        dismiss,
        cancel,
        refreshDue,
      }}
    >
      {children}
    </RemindersContext.Provider>
  );
}

export function useReminders() {
  const ctx = useContext(RemindersContext);
  if (!ctx) throw new Error('useReminders must be used within RemindersProvider');
  return ctx;
}
