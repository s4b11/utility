import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { triggerHaptic } from '../lib/haptics';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: {
    success: (msg: string, opts?: SnackOptions) => void;
    error: (msg: string, opts?: SnackOptions) => void;
    info: (msg: string, opts?: SnackOptions) => void;
    warn: (msg: string, opts?: SnackOptions) => void;
  };
}

const ToastContext = createContext<ToastContextType | null>(null);

/** DESIGN.md 4.23 snackbar: one at a time, 4 s (6 s with an action), out on the fast effects spring. */
const SHOW_MS = 4000;
const SHOW_ACTION_MS = 6000;
const LEAVE_MS = 140;

export interface SnackOptions {
  action?: string;
  onAction?: () => void;
  close?: boolean;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<(Toast & SnackOptions) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);
  const hostRef = useRef<HTMLDivElement>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const addToast = useCallback((message: string, type: ToastType, opts: SnackOptions = {}) => {
    const id = Math.random().toString(36).substring(2, 9);
    triggerHaptic(type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'light');
    // One at a time: a new message replaces the current one and restarts its timer.
    clearTimers();
    setLeaving(false);
    setCurrent({ id, message, type, ...opts, close: opts.close ?? (!!opts.action || type === 'error') });
    timers.current.push(window.setTimeout(() => {
      setLeaving(true);
      timers.current.push(window.setTimeout(() => {
        setCurrent((prev) => (prev?.id === id ? null : prev));
        setLeaving(false);
      }, LEAVE_MS));
    }, opts.action ? SHOW_ACTION_MS : SHOW_MS));
  }, [clearTimers]);

  const dismiss = useCallback(() => {
    clearTimers();
    setLeaving(false);
    setCurrent(null);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  // Raise the host into the top layer each time a snackbar shows (DESIGN.md 4.23).
  useEffect(() => {
    const host = hostRef.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!host || !current || !host.showPopover) return;
    try { if (host.matches(':popover-open')) host.hidePopover?.(); host.showPopover(); } catch { /* no popover API */ }
  }, [current]);

  useEffect(() => {
    const showLinkError = () => addToast('Could not open the browser. Try again.', 'error');
    window.addEventListener('utility:link-error', showLinkError);
    return () => window.removeEventListener('utility:link-error', showLinkError);
  }, [addToast]);

  const toast = useMemo(() => ({
    success: (msg: string, opts?: SnackOptions) => addToast(msg, 'success', opts),
    error: (msg: string, opts?: SnackOptions) => addToast(msg, 'error', opts),
    info: (msg: string, opts?: SnackOptions) => addToast(msg, 'info', opts),
    warn: (msg: string, opts?: SnackOptions) => addToast(msg, 'warning', opts),
  }), [addToast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div ref={hostRef} className={`snackbars${current ? '' : ' hidden'}`} aria-live="polite" {...{ popover: 'manual' }}>
        {current && (
          <div key={current.id} role="status" className={`snackbar${leaving ? ' out' : ''}`}>
            <span className="break-words">{current.message}</span>
            {current.action && (
              <button type="button" className="btn text" onClick={() => { const f = current.onAction; dismiss(); f?.(); }}>
                {current.action}
              </button>
            )}
            {current.close && (
              <button type="button" className="icon-btn" onClick={dismiss} aria-label="Close">
                <X className="i" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}
