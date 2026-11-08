import React, { useState, useRef, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { RemindersProvider, useReminders } from './context/RemindersContext';
import { SetupView } from './components/auth/SetupView';
import { LoginView } from './components/auth/LoginView';
import { SecurityModal, type SettingsTab } from './components/auth/SecurityModal';
import { NotificationsSheet } from './components/reminders/NotificationsSheet';
import { NotificationsProvider, useNotifications } from './context/NotificationsContext';
import { Header } from './components/layout/Header';
import { LaunchScreen } from './components/layout/LaunchScreen';
import { BottomNav, NavTab } from './components/layout/BottomNav';
import { Sidebar } from './components/layout/Sidebar';
import { PullIndicator, usePullToRefresh } from './components/layout/PullToRefresh';
import { waitForIdle } from './lib/api';
import { initTabHistory, pushTab } from './lib/backStack';
import { HomeView } from './features/home/HomeView';
import { AgentView } from './features/agent/AgentView';

import { TasksView } from './features/tasks/TasksView';
import { CalendarView } from './features/calendar/CalendarView';
import { WalletView } from './features/wallet/WalletView';
import { NotesView } from './features/notes/NotesView';
import { CommandsView } from './features/commands/CommandsView';
import { LinksView } from './features/links/LinksView';
import { JsonToolView } from './features/tools/JsonToolView';
import { MarkdownToolView } from './features/tools/MarkdownToolView';
import { JobsView } from './features/jobs/JobsView';
import { EmailView } from './features/email/EmailView';

/* Tabs whose content is reloaded from the server by pull-to-refresh. The agent keeps its own
   chat scroller, and the JSON / Markdown tools hold unsaved local input, so they opt out. */
const PULL_REFRESH_TABS = new Set<NavTab>(['home', 'tasks', 'calendar', 'wallet', 'notes', 'jobs', 'commands', 'links', 'email']);

const TAB_TITLES: Record<NavTab, string> = {
  home: 'Home',
  agent: 'AI agent',
  tasks: 'Tasks',
  calendar: 'Calendar',
  wallet: 'Wallet',
  notes: 'Notes',
  jobs: 'Jobs feed',
  commands: 'Commands',
  links: 'Links',
  json: 'JSON inspector',
  markdown: 'Markdown editor',
  email: 'Email',
};

function MainApp() {
  const { session, needsSetup, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [agentVisited, setAgentVisited] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('security');
  const [emailSettingsVersion, setEmailSettingsVersion] = useState(0);
  const openSettings = (tab: SettingsTab = 'security') => { setSettingsTab(tab); setIsSecurityOpen(true); };
  const [agentSettingsVersion, setAgentSettingsVersion] = useState(0);
  const [launching, setLaunching] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { refreshDue } = useReminders();
  const { refresh: refreshNotifications } = useNotifications();

  // Remount the active view so it reloads, then wait until its requests settle.
  const refreshActive = async () => {
    setRefreshKey((k) => k + 1);
    await new Promise((r) => window.setTimeout(r, 50));
    await Promise.all([waitForIdle(), refreshDue().catch(() => undefined), refreshNotifications()]);
  };
  const pullState = usePullToRefresh(pageRef, refreshActive, !!session && PULL_REFRESH_TABS.has(activeTab));

  useEffect(() => {
    const timer = window.setTimeout(() => setLaunching(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  const showTab = (tab: NavTab) => {
    setActiveTab(tab);
    if (tab === 'agent') setAgentVisited(true);
    pageRef.current?.scrollTo({ top: 0 });
    setScrolled(false);
  };

  // Android back gesture / browser back: return to the previously opened page instead of
  // closing the app. Each tab change is a history entry (see lib/backStack).
  const activeRef = useRef(activeTab);
  activeRef.current = activeTab;
  useEffect(() => {
    if (!session) return;
    return initTabHistory(
      activeRef.current,
      (tab) => {
        const next = (tab in TAB_TITLES ? tab : 'home') as NavTab;
        if (next !== activeRef.current) showTab(next);
      },
      () => activeRef.current,
    );
  }, [session]);

  const selectTab = (tab: NavTab) => {
    if (tab !== activeRef.current) pushTab(tab);
    showTab(tab);
  };

  if (launching) return <LaunchScreen />;

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-surface">
        <div className="loading" role="progressbar" aria-label="Loading" />
      </div>
    );
  }

  if (needsSetup) {
    return <SetupView />;
  }

  if (!session) {
    return <LoginView />;
  }

  const title = TAB_TITLES[activeTab] || TAB_TITLES.tasks;

  return (
    <div className="app-has-nav app-frame flex h-dvh overflow-hidden bg-surface text-on-surface">
      {/* DESIGN.md 4.15 navigation rail (wide windows) */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={selectTab}
        onOpenSecurity={() => openSettings()}
      />

      {/* Main column */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface lg:bg-transparent">
        {/* DESIGN.md 4.14 small top app bar; surface-container once content scrolls under it */}
        <Header
          title={title}
          scrolled={scrolled}
          onOpenSecurity={() => openSettings()}
        />

        {/* Scrollable Page Body - fluid full width with basic spacing */}
        <div className="page-sheet relative flex min-h-0 min-w-0 flex-1 flex-col">
          <PullIndicator {...pullState} />
          <main ref={pageRef} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)} aria-label={`${title} content`} className={`${pullState.refreshing ? 'pull-refreshing ' : ''}min-h-0 w-full min-w-0 flex-1 bg-surface ${activeTab === 'agent' ? 'overflow-clip px-2 pt-2 pb-[calc(var(--nav-bar-h)+env(safe-area-inset-bottom,0px))]' : 'overflow-y-auto overscroll-y-contain px-4 pt-2 pb-[calc(var(--nav-bar-h)+88px+env(safe-area-inset-bottom,0px))]'} lg:px-6 lg:pb-8`}>
            {agentVisited && <div hidden={activeTab !== 'agent'} className="h-full"><AgentView active={activeTab === 'agent'} onNavigate={selectTab} settingsVersion={agentSettingsVersion} /></div>}
            <div key={refreshKey} className="contents">
            {activeTab === 'home' && <HomeView onSelectTab={selectTab} />}
            {activeTab === 'tasks' && <TasksView />}
            {activeTab === 'calendar' && <CalendarView />}
            {activeTab === 'wallet' && <WalletView />}
            {activeTab === 'notes' && <NotesView />}
            {activeTab === 'jobs' && <JobsView />}
            {activeTab === 'commands' && <CommandsView />}
            {activeTab === 'links' && <LinksView />}
            {activeTab === 'email' && <EmailView onOpenSettings={() => openSettings('email')} settingsVersion={emailSettingsVersion} />}
            </div>
            {activeTab === 'json' && <JsonToolView />}
            {activeTab === 'markdown' && <MarkdownToolView />}
          </main>
        </div>
      </div>

      {/* Compact windows: navigation bar */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={selectTab}
      />

      {/* Notification centre (app bar bell) */}
      <NotificationsSheet onNavigate={selectTab} />

      {/* Header settings: account security and AI Agent configuration */}
      <SecurityModal
        isOpen={isSecurityOpen}
        onClose={() => setIsSecurityOpen(false)}
        onAgentConfigured={() => setAgentSettingsVersion(version => version + 1)}
        initialTab={settingsTab}
        onEmailSaved={() => setEmailSettingsVersion(version => version + 1)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RemindersProvider>
          <NotificationsProvider>
            <MainApp />
          </NotificationsProvider>
        </RemindersProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
