import React, { useRef, useState } from 'react';
import {
  ListTodo,
  House,
  Calendar,
  CreditCard,
  StickyNote,
  Terminal,
  Link2,
  Braces,
  FileText,
  Briefcase,
  Sparkles,
  ChevronsUpDown,
  Mail,
  Menu,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useReminders } from '../../context/RemindersContext';
import { triggerHaptic } from '../../lib/haptics';
import { BrandMark } from '../ui/BrandMark';
import { AccountMenu, avatarInitials, avatarTint } from './Header';
import type { NavTab } from './BottomNav';

export const NAV_ITEMS = [
  { id: 'home' as NavTab, label: 'Home', icon: House },
  { id: 'agent' as NavTab, label: 'AI agent', icon: Sparkles },
  { id: 'tasks' as NavTab, label: 'Tasks', icon: ListTodo },
  { id: 'calendar' as NavTab, label: 'Calendar', icon: Calendar },
  { id: 'wallet' as NavTab, label: 'Wallet', icon: CreditCard },
  { id: 'notes' as NavTab, label: 'Notes', icon: StickyNote },
  { id: 'jobs' as NavTab, label: 'Jobs', icon: Briefcase },
  { id: 'commands' as NavTab, label: 'Commands', icon: Terminal },
  { id: 'links' as NavTab, label: 'Links', icon: Link2 },
  { id: 'json' as NavTab, label: 'JSON', icon: Braces },
  { id: 'markdown' as NavTab, label: 'Markdown', icon: FileText },
  { id: 'email' as NavTab, label: 'Email', icon: Mail },
];

type NavItem = (typeof NAV_ITEMS)[number];

/** Rail sections (DESIGN.md 4.15 "Section label"): every tab appears in exactly one. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'Workspace', ids: ['home', 'agent', 'tasks', 'calendar', 'notes'] as NavTab[] },
  { label: 'Saved', ids: ['links', 'commands', 'wallet', 'jobs'] as NavTab[] },
  { label: 'Tools', ids: ['email', 'json', 'markdown'] as NavTab[] },
].map(({ label, ids }) => ({
  label,
  items: ids.map((id) => NAV_ITEMS.find((item) => item.id === id)).filter((item): item is NavItem => !!item),
}));

const RAIL_KEY = 'utility_rail_expanded';

interface RailProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenSecurity: () => void;
  /** Modal rail on compact windows: always expanded, closes after a choice. */
  modal?: boolean;
  onClose?: () => void;
}

/**
 * DESIGN.md 4.15 navigation rail. Collapsed 96 / expanded 240. The head is the app icon and
 * name; hovering (or focusing) the icon turns it into the menu icon, and it collapses or
 * expands the rail. Items show a 56 x 32 indicator, `secondary-container` when current;
 * section labels and counts appear when expanded. Ask AI (a flat FAB) and the account sit at
 * the foot. Head and foot stay put; only the menu between them scrolls. Every collapsed
 * control is centred on the same 48px axis.
 */
export function Rail({ activeTab, onSelectTab, onOpenSecurity, modal = false, onClose }: RailProps) {
  const { session, logout } = useAuth();
  const { due } = useReminders();
  const [expanded, setExpanded] = useState(() => {
    if (modal) return true;
    try { return localStorage.getItem(RAIL_KEY) !== '0'; } catch { return true; }
  });
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLButtonElement>(null);
  const name = session?.username || 'Owner';

  const toggle = () => {
    triggerHaptic('light');
    if (modal) { onClose?.(); return; }
    setExpanded((v) => {
      try { localStorage.setItem(RAIL_KEY, v ? '0' : '1'); } catch { /* ignore */ }
      return !v;
    });
  };
  const choose = (tab: NavTab) => {
    triggerHaptic('light');
    onSelectTab(tab);
    onClose?.();
  };

  return (
    <nav className={`rail${expanded ? ' expanded' : ''}`} aria-label="Main navigation">
      <div className="rail-head">
        <button
          type="button"
          className="rail-brand"
          onClick={toggle}
          aria-label={modal ? 'Close navigation' : expanded ? 'Collapse navigation' : 'Expand navigation'}
          data-tip={expanded ? undefined : 'Expand navigation'}
          aria-expanded={expanded}
        >
          <span className="rail-brand-ico" aria-hidden="true">
            <BrandMark className="mark" />
            <Menu className="i rail-brand-menu" />
          </span>
          <span className="rail-brand-name">Utility</span>
        </button>
      </div>

      <div className="rail-scroll">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="rail-group">
          <p className="rail-section">{group.label}</p>
          <div className="rail-items">
            {group.items.map((item) => {
              const Icon = item.icon;
              const current = activeTab === item.id;
              const count = item.id === 'home' && due.length ? due.length : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="rail-item"
                  aria-current={current ? 'page' : undefined}
                  onClick={() => choose(item.id)}
                  data-tip={expanded ? undefined : item.label}
                >
                  <span className="rail-ind">
                    <span className="badge-host">
                      <Icon className="i" aria-hidden="true" />
                      {count > 0 && <span className="badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
                    </span>
                    <span className="rail-lbl-x">{item.label}</span>
                    {count > 0 && <span className="count" aria-label={`${count} reminders due`}>{count}</span>}
                  </span>
                  <span className="rail-lbl">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      </div>

      <div className="rail-foot">
        <button
          type="button"
          className="fab flat rail-ask"
          onClick={() => choose('agent')}
          aria-label="Ask the AI agent"
          data-tip={expanded ? undefined : 'Ask the AI agent'}
        >
          <Sparkles className="i" aria-hidden="true" />
          <span className="fab-label">Ask AI</span>
        </button>
        <button
          ref={accountRef}
          type="button"
          className="account sl"
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          aria-controls={accountOpen ? 'account-menu-rail' : undefined}
          aria-label={expanded ? undefined : `Account, ${name}`}
          data-tip={expanded ? undefined : 'Account'}
          onClick={() => { triggerHaptic('light'); setAccountOpen(!accountOpen); }}
        >
          <span className={`avatar s t-${avatarTint(name)}`} aria-hidden="true">{avatarInitials(name)}</span>
          <span className="acc-text">
            <b>{name}</b>
            <small>Single owner</small>
          </span>
          <ChevronsUpDown className="i acc-chev" aria-hidden="true" />
        </button>
      </div>
      {accountOpen && (
        <AccountMenu
          id="account-menu-rail"
          anchorRef={accountRef}
          align="start"
          name={expanded ? undefined : name}
          onClose={() => setAccountOpen(false)}
          onOpenSecurity={() => { onClose?.(); onOpenSecurity(); }}
          onLogout={() => { void logout(); }}
        />
      )}
    </nav>
  );
}

/** Desktop rail at the leading edge (hidden on compact windows, which use the navigation bar). */
export function Sidebar(props: Omit<RailProps, 'modal' | 'onClose'>) {
  return (
    <div className="block h-full shrink-0 max-lg:hidden">
      <Rail {...props} />
    </div>
  );
}
