import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bell, Briefcase, CalendarDays, Check, ChevronRight, CircleAlert, Clock, CreditCard, Info, Landmark, Link2, Plus, RotateCw, SquareCheck, StickyNote, SquareTerminal, X, type LucideIcon , Sparkles } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { BrandMark } from '../../components/ui/BrandMark';
import { useToast } from '../../context/ToastContext';
import { AgentFields, AgentReferenceModal, KIND_LABELS, agentError } from './AgentDetails';
import { AgentMarkdown } from './AgentMarkdown';
import type { AgentChatInput, AgentHistoryMessage, AgentItemKind, AgentProposal, AgentReference } from '../../types/agent';
import type { NavTab } from '../../components/layout/BottomNav';

interface ChatMessage extends AgentHistoryMessage {
  id: string;
  references?: AgentReference[];
  proposalIds?: string[];
}

const STARTERS = ['What needs my attention today?', 'Find a saved link or command', 'Help me plan my week'];
const KIND_ICONS: Partial<Record<AgentItemKind, LucideIcon>> = {
  task: SquareCheck, event: CalendarDays, note: StickyNote, link: Link2, command: SquareTerminal,
  job: Briefcase, reminder: Bell, card: CreditCard, bank: Landmark,
};
const STATUS_BADGES: Record<AgentProposal['status'], { label: string; tone: string }> = {
  pending: { label: 'Needs your approval', tone: 't-warning' },
  processing: { label: 'Adding…', tone: 't-primary' },
  approved: { label: 'Added', tone: 't-success' },
  rejected: { label: 'Rejected', tone: 't-neutral' },
  expired: { label: 'Expired', tone: 't-neutral' },
  failed: { label: 'Could not add', tone: 't-error' },
};
/** DESIGN.md 5.2: proposal status as a toned badge; "already handled" notices read neutral. */
function statusBadge(status: AgentProposal['status'], handled?: string) {
  return handled ? { label: handled, tone: 't-neutral' } : STATUS_BADGES[status] || STATUS_BADGES.expired;
}
const utf8 = new TextEncoder();

function historyForRequest(messages: ChatMessage[]): AgentHistoryMessage[] {
  return messages.slice(-16).map(({ role, content }) => {
    if (utf8.encode(content).length <= 8000) return { role, content };
    let bytes = 0;
    let prefix = '';
    for (const character of content) {
      const length = utf8.encode(character).length;
      if (bytes + length > 8000) break;
      bytes += length;
      prefix += character;
    }
    return { role, content: prefix };
  });
}

/** Keep mounted while navigating to preserve the current conversation in memory. */
export function AgentView({ onNavigate, active = true, settingsVersion = 0 }: { onNavigate?: (tab: NavTab) => void; active?: boolean; settingsVersion?: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [retryRequest, setRetryRequest] = useState<AgentChatInput | null>(null);
  const [proposals, setProposals] = useState<Record<string, AgentProposal>>({});
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState('');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [busyDecision, setBusyDecision] = useState<string | null>(null);
  const [decisionAction, setDecisionAction] = useState<'approve' | 'reject' | null>(null);
  const [decisionError, setDecisionError] = useState('');
  const [unavailable, setUnavailable] = useState<Record<string, string>>({});
  const [reference, setReference] = useState<AgentReference | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [now, setNow] = useState(Date.now() / 1000);
  const conversationScroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const requestRunning = useRef(false);
  const decisionRunning = useRef(false);
  const toast = useToast();

  async function loadPending() {
    setPendingLoading(true); setPendingError('');
    try {
      const pending = await api.agent.proposals();
      setProposals(prev => ({ ...prev, ...Object.fromEntries(pending.map(item => [item.id, item])) }));
    } catch (e) { setPendingError(agentError(e)); }
    finally { setPendingLoading(false); }
  }

  useEffect(() => {
    void loadPending();
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (active && (messages.length || sending) && conversationScroll.current?.getClientRects().length) {
      conversationScroll.current.scrollTo({ top: conversationScroll.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, sending, active]);

  useEffect(() => {
    let current = true;
    void api.agent.settings().then(settings => { if (current) setConfigured(settings.configured); }).catch(() => { if (current) setConfigured(null); });
    return () => { current = false; };
  }, [settingsVersion]);

  async function runChat(payload: AgentChatInput) {
    if (requestRunning.current) return;
    requestRunning.current = true; setSending(true); setError(''); setRetryRequest(null);
    try {
      const answer = await api.agent.chat(payload);
      setConfigured(true);
      setProposals(prev => ({ ...prev, ...Object.fromEntries((answer.proposals || []).map(proposal => [proposal.id, proposal])) }));
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: answer.reply, references: answer.references || [], proposalIds: (answer.proposals || []).map(proposal => proposal.id) }]);
    } catch (e) {
      setError(agentError(e)); setRetryRequest(payload);
      if (e instanceof ApiError && e.code === 'agent_not_configured') setConfigured(false);
    } finally { requestRunning.current = false; setSending(false); }
  }

  function send(text = input) {
    const message = text.trim();
    if (!message || requestRunning.current) return;
    if (utf8.encode(message).length > 8000) {
      setError('That message is too long. Please shorten it and try again.');
      setRetryRequest(null);
      return;
    }
    const payload: AgentChatInput = {
      message,
      history: historyForRequest(messages),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      utc_offset_minutes: -new Date().getTimezoneOffset(),
    };
    while (payload.history.length && utf8.encode(JSON.stringify(payload)).length > 78000) payload.history.shift();
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: message }]);
    setInput('');
    void runChat(payload);
  }

  function effectiveStatus(proposal: AgentProposal) {
    return proposal.status === 'pending' && proposal.expires_at <= now ? 'expired' : proposal.status;
  }

  async function decide(proposal: AgentProposal, approve: boolean) {
    if (decisionRunning.current || effectiveStatus(proposal) !== 'pending' || unavailable[proposal.id]) return;
    decisionRunning.current = true; setBusyDecision(proposal.id); setDecisionAction(approve ? 'approve' : 'reject'); setDecisionError('');
    try {
      const result = await (approve ? api.agent.approve(proposal.id) : api.agent.reject(proposal.id));
      setProposals(prev => ({ ...prev, [proposal.id]: result.proposal }));
      toast.success(approve ? `${KIND_LABELS[proposal.kind]} added.` : 'Suggestion rejected. Nothing was added.');
      if (approve && result.reference) {
        const createdReference = result.reference;
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: `${KIND_LABELS[proposal.kind]} added: ${createdReference.title}`, references: [createdReference] }]);
        window.dispatchEvent(new CustomEvent('utility:agent-item-added', { detail: { kind: createdReference.kind, id: createdReference.id } }));
      }
      setReviewId(null);
    } catch (e) {
      const message = agentError(e); setDecisionError(message); toast.error(message);
      if (e instanceof ApiError && e.status === 410) setProposals(prev => ({ ...prev, [proposal.id]: { ...proposal, status: 'expired' } }));
      if (e instanceof ApiError && e.status === 409) { setUnavailable(prev => ({ ...prev, [proposal.id]: 'Already handled' })); void loadPending(); }
      if (e instanceof ApiError && e.status === 404) setUnavailable(prev => ({ ...prev, [proposal.id]: 'No longer available' }));
      if (e instanceof ApiError && e.code === 'invalid_proposal') setProposals(prev => ({ ...prev, [proposal.id]: { ...proposal, status: 'failed' } }));
    } finally { decisionRunning.current = false; setBusyDecision(null); setDecisionAction(null); }
  }

  const conversationProposalIds = new Set(messages.flatMap(message => message.proposalIds || []));
  const recovered = Object.values(proposals).filter(proposal => effectiveStatus(proposal) === 'pending' && !conversationProposalIds.has(proposal.id) && !unavailable[proposal.id]);
  const review = reviewId ? proposals[reviewId] : undefined;
  const reviewStatus = review ? effectiveStatus(review) : undefined;

  function proposalCard(proposal: AgentProposal) {
    const status = effectiveStatus(proposal);
    const handled = unavailable[proposal.id];
    const badge = statusBadge(status, handled);
    const actionable = status === 'pending' && !handled;
    const KindIcon = KIND_ICONS[proposal.kind] || Plus;
    return <div key={proposal.id} data-agent-proposal={proposal.id} className="flex min-w-0 flex-col rounded-sm border border-outline-variant bg-surface-container-lowest p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="tag"><KindIcon className="i" aria-hidden="true" />{KIND_LABELS[proposal.kind] || 'Item'}</span>
        <span className={`status ${badge.tone}`}><span className="dot" aria-hidden="true" />{badge.label}</span>
      </div>
      <h4 className="break-words title-small text-on-surface [overflow-wrap:anywhere]">{proposal.title}</h4>
      {actionable && <p className="mt-1 body-medium text-on-surface-variant">Review the details before adding.</p>}
      <div className="mt-3">
        <button type="button" onClick={() => { setDecisionError(''); setReviewId(proposal.id); }} className={actionable ? 'btn tonal xs' : 'btn text xs -ml-3'}>{actionable ? 'Review suggestion' : 'View details'}<ChevronRight className="i" aria-hidden="true" /></button>
      </div>
    </div>;
  }

  const reviewBadge = review ? statusBadge(reviewStatus || review.status, unavailable[review.id]) : undefined;
  const reviewBusy = review ? busyDecision === review.id : false;

  return <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col" data-agent-view>
    <div ref={conversationScroll} className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-y-contain pb-4" data-agent-scroll tabIndex={0} role="region" aria-label="Chat history">
      {configured === false && <div className="flex items-start gap-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-3.5 body-medium text-on-surface-variant"><Info className="i mt-0.5 shrink-0 text-on-surface-variant" aria-hidden="true" /><p className="min-w-0">Open Settings in the header, then choose AI Agent to connect your account.</p></div>}

      {pendingLoading && <p role="status" className="flex items-center gap-2 body-medium text-on-surface-variant"><span className="loading xs" aria-hidden="true" />Checking saved suggestions…</p>}
      {pendingError && <div role="alert" className="flex items-start gap-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-3.5 body-medium text-on-surface-variant"><CircleAlert className="i mt-0.5 shrink-0 text-warning" aria-hidden="true" /><div className="min-w-0 flex-1"><p>Could not load saved suggestions. {pendingError}</p><button type="button" onClick={() => void loadPending()} className="btn outlined xs mt-2.5"><RotateCw className="i" aria-hidden="true" />Try again</button></div></div>}
      {recovered.length > 0 && <section aria-label="Saved suggestions" className="space-y-3"><div><h3 className="title-medium text-on-surface">Waiting for your approval</h3><p className="mt-0.5 body-medium text-on-surface-variant">Suggestions saved from an earlier conversation.</p></div><div className="grid gap-3 sm:grid-cols-2">{recovered.map(proposalCard)}</div></section>}

      {messages.length === 0 && <section className="my-auto px-2 py-8 text-center sm:py-12">
        <div className="empty !pb-6">
          <div className="empty-shape" aria-hidden="true"><Sparkles className="i" /></div>
          <h3>What can I help you with?</h3>
          <p>Ask about your saved items, find something, or create a task, note, or calendar event.</p>
        </div>
        <div className="mx-auto flex max-w-xl flex-wrap justify-center gap-2">{STARTERS.map(starter => <button type="button" key={starter} onClick={() => send(starter)} aria-disabled={sending || undefined} className="chip max-w-full px-4"><span className="chip-label">{starter}</span></button>)}</div>
        <p className="mt-5 body-small text-on-surface-variant">Nothing is added until you approve it.</p>
      </section>}

      <div role="log" aria-label="Agent conversation" aria-live="polite" aria-relevant="additions" className="space-y-6">
        {messages.map(message => message.role === 'user'
          ? <article key={message.id} className="flex justify-end">
            <div className="max-w-[95%] select-text rounded-sm bg-secondary-container px-4 py-2.5 body-medium text-on-surface">
              <span className="sr-only">You: </span><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
            </div>
          </article>
          : <article key={message.id} className="flex min-w-0 gap-3">
            <BrandMark size={28} className="h-7 w-7 shrink-0" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="min-w-0 pt-0.5 body-medium ">
                <span className="sr-only">Agent: </span><AgentMarkdown content={message.content} />
              </div>
              {message.references && message.references.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Related items">{message.references.map(ref => {
                const KindIcon = KIND_ICONS[ref.kind] || ChevronRight;
                return <button type="button" key={`${ref.kind}-${ref.id}`} onClick={() => setReference(ref)} title={ref.title} className="chip max-w-full"><KindIcon className="i" aria-hidden="true" /><span className="shrink-0 text-on-surface-variant">{KIND_LABELS[ref.kind] || 'Item'}</span><span className="chip-label text-on-surface">{ref.title}</span><ChevronRight className="i chev" aria-hidden="true" /></button>;
              })}</div>}
              {message.proposalIds && message.proposalIds.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{message.proposalIds.map(id => proposals[id] ? proposalCard(proposals[id]) : null)}</div>}
            </div>
          </article>)}
        {sending && <div role="status" className="flex items-center gap-3 body-medium text-on-surface-variant"><BrandMark size={28} className="h-7 w-7 shrink-0" /><span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-on-surface-variant" style={{ animationDelay: `${i * 150}ms` }} />)}</span>Looking through your utility…</div>}
      </div>
      {error && <div role="alert" className="flex items-start gap-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-3.5"><CircleAlert className="i mt-0.5 shrink-0 text-error" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="body-medium text-on-surface">{error}</p>{retryRequest && <button type="button" aria-disabled={sending || undefined} onClick={() => void runChat(retryRequest)} className="btn outlined xs mt-2.5"><RotateCw className="i" aria-hidden="true" />Try again</button>}</div></div>}
    </div>

    <div className="sticky bottom-0 z-10 shrink-0 pb-2 pt-3 lg:pb-0" data-agent-composer>
      <form onSubmit={event => { event.preventDefault(); send(); }} className="flex items-end gap-2 rounded-lg-inc border border-outline bg-surface-container-lowest p-1.5 pl-2 transition-[border-color,box-shadow] duration-150 ease-spatial-fast focus-within:border-primary focus-within:ring-[3px] focus-within:ring-secondary-container">
        <label htmlFor="agent-message" className="sr-only">Message the agent</label>
        <textarea ref={composer} id="agent-message" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia('(min-width: 768px)').matches) { event.preventDefault(); send(); } }} rows={2} maxLength={4000} placeholder="Ask a question or describe what to add…" className="max-h-40 min-h-11 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 body-medium text-on-surface outline-none placeholder:text-on-surface-variant" />
        <button type="submit" aria-disabled={!input.trim() || sending} aria-label="Send message" data-tip={sending ? 'Sending your message' : !input.trim() ? 'Type a message to send' : 'Send message'} className={`icon-btn shrink-0 !bg-primary !text-on-primary hover:!bg-primary ${sending ? '!cursor-progress !opacity-100' : ''}`}>{sending ? <span className="loading xs" aria-hidden="true" /> : <ArrowUp className="i !stroke-[2.1]" aria-hidden="true" />}</button>
      </form>
    </div>

    <Modal isOpen={!!review} onClose={() => { if (!busyDecision) setReviewId(null); }} title={review ? `Review ${KIND_LABELS[review.kind] || 'suggestion'}` : 'Review suggestion'} footer={review && <div className="space-y-3">
      {decisionError && <p role="alert" className="flex items-start gap-2 body-medium text-error"><CircleAlert className="i mt-px h-4 w-4 shrink-0" aria-hidden="true" />{decisionError}</p>}
      {reviewStatus === 'pending' && !unavailable[review.id] ? <div className="flex flex-wrap justify-end gap-2"><button type="button" aria-disabled={busyDecision !== null} onClick={() => void decide(review, false)} className={`btn outlined${reviewBusy && decisionAction === 'reject' ? ' is-busy' : ''}`}>{reviewBusy && decisionAction === 'reject' ? <span className="loading" aria-hidden="true" /> : <X className="i" aria-hidden="true" />}Reject</button><button type="button" aria-disabled={busyDecision !== null} onClick={() => void decide(review, true)} className={`btn filled${reviewBusy && decisionAction === 'approve' ? ' is-busy' : ''}`}>{reviewBusy && decisionAction === 'approve' ? <span className="loading" aria-hidden="true" /> : <Check className="i" aria-hidden="true" />}Approve &amp; add</button></div> : <p className="body-medium text-on-surface-variant">{unavailable[review.id] ? unavailable[review.id] + '. Refresh your saved items to check the result.' : reviewStatus === 'approved' ? 'Added to your utility.' : reviewStatus === 'rejected' ? 'Rejected. Nothing was added.' : reviewStatus === 'failed' ? 'This suggestion could not be added. Ask the agent to correct the details.' : reviewStatus === 'processing' ? 'This suggestion is being added.' : 'This suggestion has expired. Ask for a fresh suggestion.'}</p>}
    </div>}>
      {review && <div className="space-y-4">
        <div>
          {reviewBadge && <span className={`status ${reviewBadge.tone} mb-2.5`}><span className="dot" aria-hidden="true" />{reviewBadge.label}</span>}
          <h4 className="break-words title-large text-on-surface [overflow-wrap:anywhere]">{review.title}</h4>
          <p className="mt-1 body-medium text-on-surface-variant">{reviewStatus === 'pending' ? 'Check every detail. Approving will add this item to your utility.' : 'The original suggested details are shown below.'}</p>
        </div>
        <AgentFields data={review.data} />
        <p className="flex items-center gap-1.5 border-t border-outline-variant pt-3 body-small text-on-surface-variant"><Clock className="i h-3.5 w-3.5" aria-hidden="true" />Expires {new Date(review.expires_at * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
      </div>}
    </Modal>

    <AgentReferenceModal reference={reference} onClose={() => setReference(null)} />

  </div>;
}
