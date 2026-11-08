// ============================ Core Domain Models ============================

export interface Command {
  id: number;
  title: string;
  command: string;
  description: string;
  category: string;
  tags: string[];
  created_at: number;
  updated_at: number;
}

export interface CommandInput {
  title: string;
  command: string;
  description?: string;
  category?: string;
  tags?: string[];
}

export interface Link {
  id: number;
  title: string;
  url: string;
  description: string;
  category: string;
  tags: string[];
  created_at: number;
  updated_at: number;
}

export interface LinkInput {
  title: string;
  url: string;
  description?: string;
  category?: string;
  tags?: string[];
}

// ============================ Productivity Models ============================

export interface Recurrence {
  freq: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  until?: number | null;
  count?: number | null;
  byday: number[]; // 0=Mon .. 6=Sun
}

export interface Reminder {
  id: number;
  parent_type: 'note' | 'task' | 'event';
  parent_id: number;
  lead_minutes: number;
  remind_at?: number | null;
  status: 'active' | 'cancelled';
  snooze_until?: number | null;
  dismissed_through?: number | null;
  created_at: number;
  updated_at: number;
}

export interface ReminderInput {
  parent_type: 'note' | 'task' | 'event';
  parent_id: number;
  lead_minutes?: number;
  remind_at?: number | null;
}

export interface DueReminder {
  reminder_id: number;
  parent_type: 'note' | 'task' | 'event';
  parent_id: number;
  parent_title: string;
  fire_at: number;
  occurrence_at: number;
}

export interface Note {
  id: number;
  title: string;
  body: string;
  tags: string[];
  reminder?: Reminder | null;
  created_at: number;
  updated_at: number;
}

export interface NoteInput {
  title: string;
  body?: string;
  tags?: string[];
}

export interface Task {
  id: number;
  title: string;
  description: string;
  done: boolean;
  priority: 'low' | 'med' | 'high';
  tags: string[];
  due_at?: number | null;
  scheduled_at?: number | null;
  recurrence: Recurrence;
  reminder?: Reminder | null;
  created_at: number;
  updated_at: number;
}

export interface TaskInput {
  title: string;
  description?: string;
  done?: boolean;
  priority?: 'low' | 'med' | 'high';
  tags?: string[];
  due_at?: number | null;
  scheduled_at?: number | null;
  recurrence?: Recurrence;
}

export interface Event {
  id: number;
  title: string;
  description: string;
  location: string;
  start_at: number;
  end_at: number;
  all_day: boolean;
  tags: string[];
  recurrence: Recurrence;
  reminder?: Reminder | null;
  created_at: number;
  updated_at: number;
}

export interface EventInput {
  title: string;
  description?: string;
  location?: string;
  start_at: number;
  end_at: number;
  all_day?: boolean;
  tags?: string[];
  recurrence?: Recurrence;
}

export interface CalendarItem {
  type: 'event' | 'task' | 'reminder';
  id: number;
  title: string;
  when: number;
  end?: number | null;
  all_day: boolean;
  done?: boolean | null;
  recurring: boolean;
}

// ============================ Wallet Models ============================

export type CardType = 'visa' | 'mastercard' | 'rupay' | 'other';

export interface Card {
  id: number;
  card_name: string;
  holder_name: string;
  card_number: string;
  expiry: string;
  cvv: string;
  card_type: string;
  bank_name: string;
  created_at: number;
  updated_at: number;
}

export interface CardInput {
  card_name?: string;
  holder_name?: string;
  card_number: string;
  expiry?: string;
  cvv?: string;
  card_type?: string;
  bank_name?: string;
}

export interface BankAccount {
  id: number;
  holder_name: string;
  account_number: string;
  ifsc: string;
  branch_name: string;
  bank_name: string;
  created_at: number;
  updated_at: number;
}

export interface BankAccountInput {
  holder_name?: string;
  account_number: string;
  ifsc?: string;
  branch_name?: string;
  bank_name?: string;
}

// ============================ Auth & System ============================

export interface SetupStatusResponse {
  needs_setup: boolean;
}

export interface SetupInput {
  username: string;
  password: string;
}

export interface LoginInput {
  username: string;
  password: string;
  remember?: boolean;
  totp?: string;
  recovery?: string;
}

export interface AuthSession {
  username: string;
  csrf_token: string;
  token?: string;
  totp_enabled?: boolean;
}

export interface TotpSetupResponse {
  secret_b32: string;
  otpauth_uri: string;
  qr_svg: string;
}

export interface TotpEnableResponse {
  recovery_codes: string[];
}

// ============================ Jobs & Webhook Models ============================

export interface Job {
  id: number;
  sl_no?: string;
  job_title: string;
  company: string;
  salary_package: string;
  location: string;
  skills_required: string[];
  matched_skills: string[];
  job_type: string;
  experience: string;
  link_to_apply: string;
  status: 'new' | 'saved' | 'applied' | 'interviewing' | 'rejected' | 'archived';
  notes: string;
  source: string;
  created_at: number;
  updated_at: number;
}

export interface JobInput {
  sl_no?: string;
  job_title: string;
  company: string;
  salary_package?: string;
  location?: string;
  skills_required?: string[];
  matched_skills?: string[];
  job_type?: string;
  experience?: string;
  link_to_apply?: string;
  status?: string;
  notes?: string;
}

export interface WebhookConfig {
  webhook_url: string;
  webhook_secret: string;
  curl_sample: string;
  gas_code_sample: string;
}


// ============================ Email Templates ============================

export type EmailFieldKind = 'text' | 'textarea' | 'url' | 'list' | 'rows';

export interface EmailField {
  key: string;
  label: string;
  kind: EmailFieldKind;
  required: boolean;
  placeholder: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  tone: 'Professional' | 'Semi-formal' | 'Informal';
  description: string;
  subject: string;
  accent: string;
  fields: EmailField[];
}

export interface EmailSettings {
  relay_url: string;
  relay_secret: string;
  from_name: string;
  address: string;
  reply_to: string;
  signature: string;
  configured: boolean;
  script_code: string;
  relay_origin: string;
}

export interface EmailSettingsInput {
  relay_url?: string;
  from_name?: string;
  address?: string;
  reply_to?: string;
  signature?: string;
  regenerate_secret?: boolean;
}

export interface EmailSendInput {
  template_id: string;
  fields: Record<string, string>;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
}

export interface EmailHistoryItem {
  id: number;
  template_id: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  fields: Record<string, string>;
  status: 'sent' | 'failed';
  error: string;
  created_at: number;
}

/** In-app notification, computed by the server from tasks, events, reminders, jobs, cards and the email log. */
export interface AppNotification {
  key: string;
  kind: 'task_overdue' | 'task_due' | 'event_soon' | 'reminder' | 'jobs_new' | 'card_expiring' | 'card_expired' | 'email_failed';
  title: string;
  body: string;
  /** Epoch seconds the notification is about (due, start, fire or created time). */
  at: number;
  tab: string;
  item_id: number | null;
  reminder_id: number | null;
  read: boolean;
}

export interface NotificationList {
  items: AppNotification[];
  unread: number;
}
