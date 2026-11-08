import type {
  AuthSession,
  BankAccount,
  BankAccountInput,
  CalendarItem,
  Card,
  CardInput,
  Command,
  CommandInput,
  DueReminder,
  NotificationList,
  Event,
  EventInput,
  Link,
  LinkInput,
  LoginInput,
  Note,
  NoteInput,
  Reminder,
  ReminderInput,
  SetupInput,
  SetupStatusResponse,
  Task,
  TaskInput,
  TotpEnableResponse,
  TotpSetupResponse,
  Job,
  JobInput,
  WebhookConfig,
  EmailHistoryItem,
  EmailSendInput,
  EmailSettings,
  EmailSettingsInput,
  EmailTemplate,
} from '../types';

import { platform } from './platform';
import type { AgentChatInput, AgentChatResponse, AgentProposal, AgentProposalDecision } from '../types/agent';

function resolveDefaultBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const stored = localStorage.getItem('toolbox_server_url');
  if (stored) return stored.replace(/\/+$/, '');
  // When running directly on the web domain, use relative URLs
  if (window.location.hostname === 'utility.fermyon.app') {
    return '';
  }
  // Mobile app (Tauri on Android/iOS) or local preview default to cloud API
  return 'https://utility.fermyon.app';
}

let csrfToken: string | null = null;
let sessionToken: string | null =
  typeof window !== 'undefined' ? localStorage.getItem('toolbox_session_token') : null;
let apiBaseUrl: string = resolveDefaultBaseUrl();

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setSessionToken(token: string | null) {
  sessionToken = token;
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('toolbox_session_token', token);
    else localStorage.removeItem('toolbox_session_token');
  }
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export function setApiBaseUrl(url: string) {
  apiBaseUrl = url.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    if (apiBaseUrl) localStorage.setItem('toolbox_server_url', apiBaseUrl);
    else localStorage.removeItem('toolbox_server_url');
  }
}

export function getApiBaseUrl(): string {
  return apiBaseUrl;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  /** Extra context some endpoints return, e.g. the relay's error message or the missing field. */
  detail?: string;
  field?: string;

  constructor(status: number, code?: string, body?: { detail?: unknown; field?: unknown }) {
    super(code || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (typeof body?.detail === 'string') this.detail = body.detail;
    if (typeof body?.field === 'string') this.field = body.field;
  }
}

/* In-flight GET counter: pull-to-refresh waits for the reloaded view's requests to settle. */
let inFlightGets = 0;
const idleWaiters = new Set<() => void>();
function settleGet() {
  inFlightGets = Math.max(0, inFlightGets - 1);
  if (inFlightGets === 0) {
    idleWaiters.forEach((resolve) => resolve());
    idleWaiters.clear();
  }
}

/** Resolves once no GET requests are in flight (or after `timeoutMs`). */
export function waitForIdle(timeoutMs = 8000): Promise<void> {
  if (inFlightGets === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { window.clearTimeout(timer); idleWaiters.delete(done); resolve(); };
    const timer = window.setTimeout(done, timeoutMs);
    idleWaiters.add(done);
  });
}

async function request<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: any
): Promise<T> {
  if (method !== 'GET') return send<T>(method, path, body);
  inFlightGets += 1;
  try {
    return await send<T>(method, path, body);
  } finally {
    settleGet();
  }
}

async function send<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: any
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const options: RequestInit = {
    method,
    credentials: 'include', // sends cookies cross-origin or same-origin
    headers,
  };

  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
    headers['X-Session-Token'] = sessionToken;
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  if (method !== 'GET' && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const fullUrl = `${apiBaseUrl}${path}`;
  const response = await fetch(fullUrl, options);

  const isAuthEntry = path === '/api/login' || path === '/api/setup';
  if (response.status === 401 && !isAuthEntry) {
    window.dispatchEvent(new CustomEvent('auth:expired'));
  }

  let data: any = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, data?.error, data);
  }

  return data as T;
}

export const api = {
  agent: {
    settings: () => request<{ configured: boolean; model: string }>('GET', '/api/agent/settings'),
    configure: (api_key: string) => request<{ configured: boolean; model: string }>('POST', '/api/agent/settings', { api_key }),
    chat: (body: AgentChatInput) => request<AgentChatResponse>('POST', '/api/agent/chat', body),
    proposals: () => request<AgentProposal[]>('GET', '/api/agent/proposals'),
    approve: (id: string) => request<AgentProposalDecision>('POST', `/api/agent/proposals/${encodeURIComponent(id)}/approve`),
    reject: (id: string) => request<AgentProposalDecision>('POST', `/api/agent/proposals/${encodeURIComponent(id)}/reject`),
  },
  // Setup & Session
  setupStatus: () => request<SetupStatusResponse>('GET', '/api/setup-status'),
  setup: async (body: SetupInput) => {
    const res = await request<AuthSession>('POST', '/api/setup', body);
    if (res.token) setSessionToken(res.token);
    return res;
  },
  login: async (body: LoginInput) => {
    const res = await request<AuthSession>('POST', '/api/login', body);
    if (res.token) setSessionToken(res.token);
    return res;
  },
  logout: async () => {
    try {
      return await request<{ ok: boolean }>('POST', '/api/logout');
    } finally {
      setSessionToken(null);
    }
  },
  me: () => request<AuthSession>('GET', '/api/me'),

  // Two-Factor Authentication (TOTP)
  twofa: {
    setup: () => request<TotpSetupResponse>('POST', '/api/2fa/setup'),
    enable: (code: string) => request<TotpEnableResponse>('POST', '/api/2fa/enable', { code }),
    disable: (password: string, code: string) =>
      request<{ ok: boolean }>('POST', '/api/2fa/disable', { password, code }),
  },

  // Commands
  commands: {
    list: (query = '') => request<Command[]>('GET', `/api/commands${query}`),
    get: (id: number) => request<Command>('GET', `/api/commands/${id}`),
    create: (body: CommandInput) => request<Command>('POST', '/api/commands', body),
    update: (id: number, body: CommandInput) => request<Command>('PUT', `/api/commands/${id}`, body),
    remove: (id: number) => request<{ ok: boolean }>('DELETE', `/api/commands/${id}`),
  },

  // Links
  links: {
    list: (query = '') => request<Link[]>('GET', `/api/links${query}`),
    get: (id: number) => request<Link>('GET', `/api/links/${id}`),
    create: (body: LinkInput) => request<Link>('POST', '/api/links', body),
    update: (id: number, body: LinkInput) => request<Link>('PUT', `/api/links/${id}`, body),
    remove: (id: number) => request<{ ok: boolean }>('DELETE', `/api/links/${id}`),
  },

  // Notes
  notes: {
    list: (query = '') => request<Note[]>('GET', `/api/notes${query}`),
    get: (id: number) => request<Note>('GET', `/api/notes/${id}`),
    create: (body: NoteInput) => request<Note>('POST', '/api/notes', body),
    update: (id: number, body: NoteInput) => request<Note>('PUT', `/api/notes/${id}`, body),
    remove: (id: number) => request<{ ok: boolean }>('DELETE', `/api/notes/${id}`),
  },

  // Tasks
  tasks: {
    list: (query = '') => request<Task[]>('GET', `/api/tasks${query}`),
    get: (id: number) => request<Task>('GET', `/api/tasks/${id}`),
    create: (body: TaskInput) => request<Task>('POST', '/api/tasks', body),
    update: (id: number, body: TaskInput) => request<Task>('PUT', `/api/tasks/${id}`, body),
    setDone: (id: number, done: boolean) =>
      request<Task>('PUT', `/api/tasks/${id}/done`, { done }),
    remove: (id: number) => request<{ ok: boolean }>('DELETE', `/api/tasks/${id}`),
  },

  // Events
  events: {
    list: (query = '') => request<Event[]>('GET', `/api/events${query}`),
    get: (id: number) => request<Event>('GET', `/api/events/${id}`),
    create: (body: EventInput) => request<Event>('POST', '/api/events', body),
    update: (id: number, body: EventInput) => request<Event>('PUT', `/api/events/${id}`, body),
    remove: (id: number) => request<{ ok: boolean }>('DELETE', `/api/events/${id}`),
  },

  // Reminders
  reminders: {
    list: () => request<Reminder[]>('GET', '/api/reminders'),
    due: () => request<DueReminder[]>('GET', '/api/reminders/due'),
    create: (body: ReminderInput) => request<Reminder>('POST', '/api/reminders', body),
    snooze: (id: number, minutes: number) =>
      request<Reminder>('PUT', `/api/reminders/${id}/snooze`, { minutes }),
    dismiss: (id: number) => request<{ ok: boolean }>('PUT', `/api/reminders/${id}/dismiss`),
    cancel: (id: number) => request<{ ok: boolean }>('DELETE', `/api/reminders/${id}`),
  },

  // In-app notifications (no push: polled while the app is open)
  notifications: {
    list: () => request<NotificationList>('GET', '/api/notifications'),
    read: (keys: string[]) => request<{ ok: boolean }>('POST', '/api/notifications/read', { keys }),
    dismiss: (keys: string[]) => request<{ ok: boolean }>('POST', '/api/notifications/dismiss', { keys }),
  },

  // Unified Calendar
  calendar: {
    items: (from: number, to: number) =>
      request<CalendarItem[]>('GET', `/api/calendar/items?from=${from}&to=${to}`),
  },

  // Wallet
  cards: {
    list: () => request<Card[]>('GET', '/api/cards'),
    get: (id: number) => request<Card>('GET', `/api/cards/${id}`),
    create: (body: CardInput) => request<Card>('POST', '/api/cards', body),
    update: (id: number, body: CardInput) => request<Card>('PUT', `/api/cards/${id}`, body),
    remove: (id: number) => request<{ ok: boolean }>('DELETE', `/api/cards/${id}`),
  },

  banks: {
    list: () => request<BankAccount[]>('GET', '/api/banks'),
    get: (id: number) => request<BankAccount>('GET', `/api/banks/${id}`),
    create: (body: BankAccountInput) => request<BankAccount>('POST', '/api/banks', body),
    update: (id: number, body: BankAccountInput) =>
      request<BankAccount>('PUT', `/api/banks/${id}`, body),
    remove: (id: number) => request<{ ok: boolean }>('DELETE', `/api/banks/${id}`),
  },

  // Tools
  markdown: (markdown: string) =>
    request<{ html: string }>('POST', '/api/tools/markdown', { markdown }),

  // Jobs & Webhook
  jobs: {
    list: (params?: { search?: string; status?: string; type?: string }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.status) q.set('status', params.status);
      if (params?.type) q.set('type', params.type);
      const qs = q.toString();
      return request<Job[]>('GET', `/api/jobs${qs ? `?${qs}` : ''}`);
    },
    get: (id: number) => request<Job>('GET', `/api/jobs/${id}`),
    create: (body: JobInput) => request<{ id: number }>('POST', '/api/jobs', body),
    update: (id: number, body: JobInput) => request<{ status: string }>('PUT', `/api/jobs/${id}`, body),
    remove: (id: number) => request<{ status: string }>('DELETE', `/api/jobs/${id}`),
    clearAll: () => request<{ status: string }>('DELETE', '/api/jobs'),
    getWebhookConfig: () => request<WebhookConfig>('GET', '/api/jobs/webhook-config'),
    updateWebhookConfig: (body?: { webhook_secret?: string }) =>
      request<{ status: string; webhook_secret: string }>('POST', '/api/jobs/webhook-config', body || {}),
  },

  // Email templates (sent through the owner's Gmail Apps Script relay)
  email: {
    settings: () => request<EmailSettings>('GET', '/api/email/settings'),
    updateSettings: (body: EmailSettingsInput) => request<EmailSettings>('PUT', '/api/email/settings', body),
    templates: () => request<EmailTemplate[]>('GET', '/api/email/templates'),
    render: (template_id: string, fields: Record<string, string>, sample = false) =>
      request<{ html: string; subject: string }>('POST', '/api/email/render', { template_id, fields, sample }),
    send: (body: EmailSendInput) =>
      request<{ status: 'sent'; id: number; remaining?: number }>('POST', '/api/email/send', body),
    ping: () => request<{ status: 'ok'; email?: string; remaining?: number }>('POST', '/api/email/test', { mode: 'ping' }),
    sendTest: (to?: string) => request<{ status: 'sent'; to: string; remaining?: number }>('POST', '/api/email/test', { to }),
    history: () => request<EmailHistoryItem[]>('GET', '/api/email/history'),
    removeHistory: (id: number) => request<{ ok: boolean }>('DELETE', `/api/email/history/${id}`),
  },
};

export function humanizeError(code?: string): string {
  const messages: Record<string, string> = {
    invalid_credentials: 'Incorrect username or password.',
    too_many_attempts: 'Too many failed attempts. Please wait a moment and try again.',
    weak_credentials: 'Username must be 3+ characters and password 8+ characters.',
    already_setup: 'An account already exists. Please sign in.',
    title_and_command_required: 'Title and command are required.',
    title_and_url_required: 'Title and URL are required.',
    bad_json: 'Request payload could not be processed.',
    csrf: 'Your session expired. Please refresh and try again.',
    unauthorized: 'Please sign in to continue.',
    not_found: 'That item no longer exists.',
    title_required: 'A title is required.',
    bad_priority: 'Priority must be low, medium, or high.',
    bad_freq: 'That repeat frequency is invalid.',
    bad_interval: 'Repeat interval must be at least 1.',
    bad_time_range: 'The end time must be after the start time.',
    bad_parent_type: 'Invalid reminder target.',
    remind_at_required: 'Please pick a time for the reminder.',
    parent_not_found: 'The associated item no longer exists.',
    bad_range: 'Invalid date range.',
    window_too_large: 'That date range is too large.',
    card_number_required: 'Card number is required.',
    account_number_required: 'Account number is required.',
    totp_required: 'Please enter the 6-digit code from your authenticator app.',
    invalid_totp: 'Invalid authentication code. Please try again.',
    bad_totp_code: 'Invalid authentication code. Please try again.',
    totp_setup_failed: 'Could not initialize 2FA setup. Please try again.',
    email_not_configured: 'Set up Gmail sending in Settings > Email first.',
    bad_relay_url: 'That is not an Apps Script web app URL. It should end in /exec.',
    bad_email: 'Enter a valid email address.',
    bad_from_name: 'Your name must be a single line under 120 characters.',
    signature_too_long: 'Keep the signature under 1000 characters.',
    bad_recipients: 'Check the email addresses. Separate several with commas.',
    recipient_required: 'Add at least one recipient.',
    too_many_recipients: 'You can send to at most 20 people at once.',
    bad_subject: 'Add a subject (one line, up to 250 characters).',
    missing_field: 'Fill in all required fields.',
    email_rate_limited: 'Slow down a little: wait a few seconds before sending again.',
    relay_unreachable: 'Could not reach your Gmail relay. Check the web app URL.',
    relay_access: 'The Apps Script is not public. Redeploy it with "Who has access: Anyone".',
    relay_bad_secret: 'The relay rejected the secret. Copy the latest script into Apps Script and redeploy.',
    relay_failed: 'Gmail could not send this email.',
    too_large: 'That is too much content for one email.',
  };

  return (code && messages[code]) || 'Something went wrong. Please try again.';
}
