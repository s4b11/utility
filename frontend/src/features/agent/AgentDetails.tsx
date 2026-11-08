import { CircleAlert, Copy, ExternalLink, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError, humanizeError } from '../../lib/api';
import { safeWebsiteUrl } from '../../lib/links';
import { openExternal } from '../../lib/openExternal';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import type { AgentItemKind, AgentReference } from '../../types/agent';

export const KIND_LABELS: Record<AgentItemKind, string> = {
  task: 'Task', event: 'Calendar event', note: 'Note', link: 'Link', command: 'Command',
  job: 'Job', reminder: 'Reminder', card: 'Card', bank: 'Bank account',
};

const LABELS: Record<string, string> = {
  body: 'Content', due_at: 'Due', scheduled_at: 'Scheduled', start_at: 'Starts', end_at: 'Ends',
  remind_at: 'Remind at', lead_minutes: 'Minutes before', parent_type: 'Attached to', parent_id: 'Item number',
  all_day: 'All day', byday: 'Days', until: 'Until', count: 'Occurrences', freq: 'Repeats', interval: 'Every',
  created_at: 'Created', updated_at: 'Updated', expires_at: 'Expires', snooze_until: 'Snoozed until',
  dismissed_through: 'Dismissed through', done: 'Completed', job_title: 'Job title', link_to_apply: 'Application link',
  card_name: 'Card name', holder_name: 'Account holder', card_number: 'Card number', bank_name: 'Bank',
  account_number: 'Account number', branch_name: 'Branch', ifsc: 'IFSC', card_type: 'Card type',
};

export function agentError(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      agent_not_configured: 'Open Settings in the header and choose AI Agent to connect your account.',
      agent_rate_limited: 'Groq is busy right now. Wait a moment, then try again.',
      agent_provider_error: 'The agent could not complete that request. Please try again.',
      agent_unavailable: 'The agent is temporarily unavailable. Please try again.',
      proposal_expired: 'This suggestion has expired. Ask the agent for a fresh suggestion.',
      proposal_already_handled: 'This suggestion has already been handled. Its status will refresh.',
      invalid_proposal: 'This suggestion needs different details. Ask the agent to correct it.',
      invalid_api_key: 'That Groq key was not accepted. Please check it and try again.',
    };
    if (error.code && messages[error.code]) return messages[error.code];
    if (error.status === 429) return messages.agent_rate_limited;
    if (error.status === 502 || error.status === 503) return messages.agent_unavailable;
    return humanizeError(error.code);
  }
  return 'Could not connect. Check your connection and try again.';
}

function readableValue(key: string, value: unknown): string {
  if (value == null || value === '') return 'Not set';
  if (key === 'priority') return value === 'med' ? 'Medium' : String(value).replace(/^./, s => s.toUpperCase());
  if (typeof value === 'number' && (key.endsWith('_at') || ['until', 'snooze_until', 'dismissed_through'].includes(key))) {
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
  if (Array.isArray(value)) {
    if (key === 'byday') return value.map(day => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][Number(day)] || String(day)).join(', ') || 'Every day';
    return value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ') || 'None';
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** Shared complete preview for proposed and existing items, without rendering model HTML.
 *  Rendered as DESIGN.md 4.23 `kv` rows; nested objects get their own bordered group. */
export function AgentFields({ data, nested = false }: { data: Record<string, unknown>; nested?: boolean }) {
  return <dl className={`kv overflow-visible body-medium ${nested ? 'px-3.5 py-0' : 'p-0'}`}>
    {Object.entries(data).filter(([key]) => key !== 'id').map(([key, value]) => {
      const label = LABELS[key] || key.replace(/_/g, ' ').replace(/^./, s => s.toUpperCase());
      if (value && typeof value === 'object' && !Array.isArray(value)) return <div key={key} className="!grid-cols-1 !gap-2">
        <dt>{label}</dt>
        <dd><div className="rounded-sm border border-outline-variant"><AgentFields data={value as Record<string, unknown>} nested /></div></dd>
      </div>;
      const empty = value == null || value === '';
      return <div key={key} className="!items-baseline">
        <dt>{label}</dt>
        <dd className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${empty ? '!text-on-surface-variant' : ''} ${key === 'command' && !empty ? 'select-text font-mono body-medium' : ''}`}>{readableValue(key, value)}</dd>
      </div>;
    })}
  </dl>;
}

async function loadReference(reference: AgentReference): Promise<Record<string, unknown>> {
  let item: unknown;
  switch (reference.kind) {
    case 'task': item = await api.tasks.get(reference.id); break;
    case 'event': item = await api.events.get(reference.id); break;
    case 'note': item = await api.notes.get(reference.id); break;
    case 'link': item = await api.links.get(reference.id); break;
    case 'command': item = await api.commands.get(reference.id); break;
    case 'job': item = await api.jobs.get(reference.id); break;
    case 'card': item = await api.cards.get(reference.id); break;
    case 'bank': item = await api.banks.get(reference.id); break;
    case 'reminder': {
      item = (await api.reminders.list()).find(reminder => reminder.id === reference.id);
      if (!item) throw new ApiError(404, 'not_found');
      break;
    }
    default: throw new ApiError(404, 'not_found');
  }
  return item as Record<string, unknown>;
}

export function AgentReferenceModal({ reference, onClose }: { reference: AgentReference | null; onClose: () => void }) {
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const toast = useToast();
  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    setItem(null); setError('');
    void loadReference(reference).then(data => { if (!cancelled) setItem(data); }).catch(e => { if (!cancelled) setError(agentError(e)); });
    return () => { cancelled = true; };
  }, [reference, retry]);
  const url = item ? safeWebsiteUrl(String(item.url || item.link_to_apply || '')) : undefined;
  const command = typeof item?.command === 'string' ? item.command : '';
  return <Modal isOpen={reference !== null} onClose={onClose} title={reference ? `View ${KIND_LABELS[reference.kind] || 'item'}` : 'View item'}>
    {!item && !error && <div role="status" className="animate-pulse space-y-4 py-2"><span className="sr-only">Loading item</span><div className="h-6 w-2/3 rounded-sm bg-surface-container-high" /><div className="h-28 rounded-sm bg-surface-container-high" /><div className="h-20 rounded-sm bg-surface-container-high" /></div>}
    {error && <div role="alert" className="space-y-3"><p className="flex items-start gap-2 body-medium text-error"><CircleAlert className="i mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</p><button type="button" onClick={() => setRetry(v => v + 1)} className="btn outlined xs"><RotateCw className="i" aria-hidden="true" />Try again</button></div>}
    {item && <div className="space-y-4">
      <h4 className="break-words title-large text-on-surface [overflow-wrap:anywhere]">{String(item.title || item.job_title || item.card_name || item.bank_name || reference?.title || 'Item')}</h4>
      {(url || command) && <div className="flex flex-wrap gap-2">
        {url && <a href={url} target="_blank" rel="noopener noreferrer" onClick={openExternal} className="btn filled"><ExternalLink className="i" aria-hidden="true" />Open {reference?.kind === 'job' ? 'application' : 'link'}</a>}
        {command && <button type="button" onClick={() => { void navigator.clipboard.writeText(command).then(() => toast.success('Command copied.')).catch(() => toast.error('Could not copy. Select the command text to copy it.')); }} className={url ? 'btn outlined' : 'btn filled'}><Copy className="i" aria-hidden="true" />Copy command</button>}
      </div>}
      <AgentFields data={item} />
    </div>}
  </Modal>;
}
