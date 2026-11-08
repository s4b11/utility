import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellRing, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { triggerHaptic } from '../../lib/haptics';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useBackHandler } from '../../lib/backStack';

interface HeaderProps {
  title: string;
  onOpenSecurity: () => void;
}

/* DESIGN.md 4.12: avatar initials and a tint chosen from the name by character-code sum. */
const TINTS = ['primary', 'violet', 'teal', 'warning', 'rose'] as const;
export const avatarTint = (name: string) => TINTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
export const avatarInitials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((word) => word.charAt(0)).join('').toUpperCase() || 'U';

interface AccountMenuProps {
  id: string;
  anchorRef: React.RefObject<HTMLElement>;
  /** 'start' aligns left edges (rail); 'end' aligns right edges (header). */
  align?: 'start' | 'end';
  /** Optional name shown above the items when the trigger does not show it. */
  name?: string;
  onClose: () => void;
  onOpenSecurity: () => void;
  onLogout: () => void;
}

/** DESIGN.md 4.21 menu: fixed, appended to <body>, 4 px from its anchor, clamped 12 px inside the viewport. */
export function AccountMenu({ id, anchorRef, align = 'start', name, onClose, onOpenSecurity, onLogout }: AccountMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useBackHandler(true, () => closeRef.current());

  useLayoutEffect(() => {
    const el = ref.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x = align === 'end' ? a.right - w : a.left;
      let y = a.bottom + 4;
      if (y + h > vh - 12 && a.top - 4 - h >= 12) { y = a.top - 4 - h; el.style.transformOrigin = 'bottom left'; }
      x = Math.max(12, Math.min(x, vw - w - 12));
      y = Math.max(12, Math.min(y, vh - h - 12));
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
    };
    place();
    el.querySelector<HTMLElement>('.menu-item')?.focus({ preventScroll: true });

    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!el.contains(target) && !anchor.contains(target)) closeRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeRef.current();
      anchor.focus();
    };
    const onResize = () => closeRef.current();
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', onResize);
    };
  }, [anchorRef, align]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('.menu-item') ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') { event.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); items[i <= 0 ? items.length - 1 : i - 1].focus(); }
    else if (event.key === 'Home') { event.preventDefault(); items[0].focus(); }
    else if (event.key === 'End') { event.preventDefault(); items[items.length - 1].focus(); }
    else if (event.key === 'Tab') onClose();
  };

  return createPortal(
    <div ref={ref} id={id} className="menu" role="menu" aria-label={name ? `Account, ${name}` : 'Account'} onKeyDown={onKeyDown}>
      {name && (
        <>
          <p aria-hidden="true" className="truncate px-2.5 pb-1.5 pt-1 label-medium text-on-surface-variant">{name}</p>
          <div className="menu-sep" role="separator" />
        </>
      )}
      <button
        type="button"
        role="menuitem"
        className="menu-item"
        onClick={() => { triggerHaptic('light'); onClose(); onOpenSecurity(); }}
      >
        <Settings className="i" />
        <span>Settings</span>
      </button>
      <div className="menu-sep" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="menu-item danger"
        onClick={() => { triggerHaptic('light'); onClose(); onLogout(); }}
      >
        <LogOut className="i" />
        <span>Log out</span>
      </button>
    </div>,
    document.body
  );
}

interface HeaderPropsM3 extends HeaderProps {
  subtitle?: string;
  /** Content is scrolled under the bar: switch to surface-container (DESIGN.md 4.14). */
  scrolled?: boolean;
}

/** DESIGN.md 4.14 small top app bar: title-large title, label-medium subtitle, icon actions. */
export function Header({ title, subtitle, scrolled = false, onOpenSecurity }: HeaderPropsM3) {
  const { session, logout } = useAuth();
  const { unread, toggle } = useNotifications();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setAccountOpen(false);
  }, [title]);

  const name = session?.username || 'Owner';
  const bellLabel = unread ? `Notifications, ${unread} new` : 'Notifications';

  return (
    <header className={`app-bar shrink-0 safe-pt transition-colors duration-200${scrolled ? ' scrolled' : ''}`}>
      <div className="app-bar-titles">
        <h1 className="app-bar-title">{title}</h1>
        {subtitle && <p className="app-bar-sub">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={() => { triggerHaptic('light'); toggle(); }}
        className="icon-btn"
        aria-label={bellLabel}
        data-tip={bellLabel}
      >
        <span className="badge-host">
          {unread ? <BellRing className="i" aria-hidden="true" /> : <Bell className="i" aria-hidden="true" />}
          {unread > 0 && <span className="badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
        </span>
      </button>
      <ThemeToggle className="icon-btn" />
      <button
        ref={accountRef}
        type="button"
        aria-label="Account options"
        data-tip="Account options"
        aria-haspopup="menu"
        aria-expanded={accountOpen}
        aria-controls={accountOpen ? 'account-options' : undefined}
        onClick={() => { triggerHaptic('light'); setAccountOpen(!accountOpen); }}
        className="avatar-btn lg:hidden"
      >
        <span className={`avatar s t-${avatarTint(name)}`} aria-hidden="true">{avatarInitials(name)}</span>
      </button>
      {accountOpen && (
        <AccountMenu
          id="account-options"
          anchorRef={accountRef}
          align="end"
          name={session?.username}
          onClose={() => setAccountOpen(false)}
          onOpenSecurity={onOpenSecurity}
          onLogout={() => { void logout(); }}
        />
      )}
    </header>
  );
}
