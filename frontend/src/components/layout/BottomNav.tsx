import React, { useEffect } from 'react';
import { House, ListTodo, Calendar, StickyNote, Briefcase } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';

export type NavTab =
  | 'home'
  | 'agent'
  | 'tasks'
  | 'calendar'
  | 'wallet'
  | 'notes'
  | 'jobs'
  | 'commands'
  | 'links'
  | 'json'
  | 'markdown'
  | 'email';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

const TABS = [
  { id: 'tasks' as NavTab, label: 'Tasks', icon: ListTodo },
  { id: 'calendar' as NavTab, label: 'Calendar', icon: Calendar },
  { id: 'home' as NavTab, label: 'Home', icon: House },
  { id: 'jobs' as NavTab, label: 'Jobs', icon: Briefcase },
  { id: 'notes' as NavTab, label: 'Notes', icon: StickyNote },
];

/**
 * Navigation bar for compact windows: the rail item anatomy of DESIGN.md 4.15 (56 x 32
 * indicator, `secondary-container` when current, label-medium) in a row on
 * `surface-container`. Every other destination opens from the Home screen.
 */
export function BottomNav({ activeTab, onSelectTab }: BottomNavProps) {
  // Lets the snackbar sit above the bar. A body class, not `body:has(.nav-bar)`: a `:has()` on
  // body re-matches the whole document whenever anything (a menu, a toast) is added to it.
  useEffect(() => {
    document.body.classList.add('has-nav-bar');
    return () => document.body.classList.remove('has-nav-bar');
  }, []);
  return (
    <nav aria-label="Main navigation" className="nav-bar lg:hidden">
      {TABS.map((item) => {
        const Icon = item.icon;
        const current = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className="rail-item"
            aria-current={current ? 'page' : undefined}
            onClick={() => { triggerHaptic('light'); onSelectTab(item.id); }}
          >
            <span className="rail-ind"><Icon className="i" aria-hidden="true" /></span>
            <span className="rail-lbl">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
