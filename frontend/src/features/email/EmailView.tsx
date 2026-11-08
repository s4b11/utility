import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CircleAlert,
  Eye,
  Mail,
  MailCheck,
  PencilLine,
  PlugZap,
  Repeat,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { api, ApiError, humanizeError } from '../../lib/api';
import { fmtFull, fmtRelative } from '../../lib/datetime';
import { triggerHaptic } from '../../lib/haptics';
import { useToast } from '../../context/ToastContext';
import { useBackHandler } from '../../lib/backStack';
import { ConnectedGroup } from '../../components/ui/ConnectedGroup';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import type { EmailField, EmailHistoryItem, EmailSettings, EmailTemplate } from '../../types';

const TONES = ['All', 'Professional', 'Semi-formal', 'Informal'] as const;
type ToneFilter = (typeof TONES)[number];
const TONE_CLASS: Record<string, string> = { Professional: 't-primary', 'Semi-formal': 't-teal', Informal: 't-violet' };
const DRAFT_KEY = (id: string) => `utility_email_draft_${id}`;
const PREVIEW_WIDTH = 640;

type Draft = {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  subjectTouched: boolean;
  fields: Record<string, string>;
};

const emptyDraft = (): Draft => ({ to: '', cc: '', bcc: '', subject: '', subjectTouched: false, fields: {} });

function loadDraft(id: string): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(id));
    if (raw) return { ...emptyDraft(), ...JSON.parse(raw) };
  } catch {
    /* ignore a corrupt draft */
  }
  return emptyDraft();
}

/** Fill `{{key}}` placeholders in a subject line from plain field values. */
function fillSubject(pattern: string, fields: Record<string, string>, senderName: string) {
  return pattern
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => (key === 'sender_name' ? senderName : fields[key] || '').trim())
    .replace(/\s+/g, ' ')
    .replace(/\s*[·:–-]\s*$/, '')
    .trim();
}

function errorText(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const base = humanizeError(error.code);
    return error.code === 'relay_failed' && error.detail ? `${base} ${error.detail}` : base;
  }
  return fallback;
}

/** A sandboxed, scaled-down live render of an email. Scripts never run inside it. */
function EmailFrame({ html, height, title, interactive = false }: { html: string; height: number; title: string; interactive?: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // Thumbnails show a scaled desktop render; the live preview renders at the real width,
  // like a phone mail app would (all templates are fluid up to 600px).
  const scale = interactive ? 1 : width / PREVIEW_WIDTH || 0.5;
  return (
    <div ref={boxRef} className="relative w-full overflow-hidden" style={{ height }}>
      {html ? (
        <iframe
          title={title}
          sandbox=""
          srcDoc={html}
          tabIndex={interactive ? 0 : -1}
          aria-hidden={interactive ? undefined : true}
          className="absolute left-0 top-0 origin-top-left border-0 bg-white"
          style={{
            width: interactive ? '100%' : PREVIEW_WIDTH,
            height: height / scale,
            transform: `scale(${scale})`,
            pointerEvents: interactive ? 'auto' : 'none',
          }}
        />
      ) : (
        <Skeleton className="h-full w-full rounded-none" />
      )}
    </div>
  );
}

function TemplateCard({ template, onOpen }: { template: EmailTemplate; onOpen: () => void }) {
  const [html, setHtml] = useState('');
  // Render the thumbnail only once the card nears the viewport: the gallery has 30 cards,
  // and each one is a server render plus an iframe.
  const cardRef = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = cardRef.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); }
    }, { root: el.closest('main'), rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  useEffect(() => {
    if (!near) return;
    let alive = true;
    api.email
      .render(template.id, {}, true)
      .then((r) => alive && setHtml(r.html))
      .catch(() => undefined);
    return () => { alive = false; };
  }, [template.id, near]);
  return (
    <button
      ref={cardRef}
      type="button"
      onClick={() => { triggerHaptic('light'); onOpen(); }}
      className="group flex w-full flex-col overflow-hidden rounded-lg-inc border border-outline-variant bg-surface-container-lowest text-left shadow-1 transition-[transform,background-color] duration-150 ease-spatial-fast hover:bg-state-hover active:scale-[0.98]"
    >
      <div className="relative w-full border-b border-outline-variant bg-surface-container-high">
        <EmailFrame html={html} height={196} title={`${template.name} preview`} />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface-container-lowest/90 to-transparent" />
      </div>
      <div className="flex w-full items-start gap-3 p-4">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: template.accent }} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="title-medium text-on-surface">{template.name}</span>
            <span className={`status ${TONE_CLASS[template.tone] || 't-neutral'}`}>{template.tone}</span>
          </span>
          <span className="mt-1 block body-medium text-on-surface-variant">{template.description}</span>
        </span>
      </div>
    </button>
  );
}

function FieldInput({ field, value, onChange, invalid }: { field: EmailField; value: string; onChange: (v: string) => void; invalid: boolean }) {
  const id = `email-field-${field.key}`;
  const multiline = field.kind === 'textarea' || field.kind === 'list' || field.kind === 'rows';
  const hint = field.kind === 'list' ? 'One item per line.' : field.kind === 'rows' ? 'One line per item: Description | Amount' : field.kind === 'url' ? 'Must start with https:// or mailto:' : '';
  return (
    <div className={`field${invalid ? ' invalid' : ''}`}>
      <label htmlFor={id} className="field-label">
        {field.label}
        {!field.required && <span className="opt"> (optional)</span>}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={field.kind === 'textarea' ? 5 : 3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          aria-invalid={invalid || undefined}
          className={invalid ? '!border-error' : ''}
        />
      ) : (
        <input
          id={id}
          type={field.kind === 'url' ? 'url' : 'text'}
          inputMode={field.kind === 'url' ? 'url' : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          aria-invalid={invalid || undefined}
          autoComplete="off"
        />
      )}
      {hint && <p className="m-0 body-small text-on-surface-variant">{hint}</p>}
    </div>
  );
}

interface ComposeProps {
  template: EmailTemplate;
  initial?: Partial<Draft>;
  settings: EmailSettings | null;
  onBack: () => void;
  onSent: () => void;
  onOpenSettings: () => void;
}

function Compose({ template, initial, settings, onBack, onSent, onOpenSettings }: ComposeProps) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => ({ ...loadDraft(template.id), ...initial }));
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [html, setHtml] = useState('');
  const [showCc, setShowCc] = useState(() => !!(draft.cc || draft.bcc));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const senderName = settings?.from_name || '';

  const subject = draft.subjectTouched ? draft.subject : fillSubject(template.subject, draft.fields, senderName);

  // Keep a local draft so pull-to-refresh, navigation or a closed app never loses work.
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY(template.id), JSON.stringify({ ...draft, subject }));
  }, [draft, subject, template.id]);

  // Live preview, rendered by the server so it is exactly what will be sent.
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      api.email.render(template.id, draft.fields).then((r) => alive && setHtml(r.html)).catch(() => undefined);
    }, 300);
    return () => { alive = false; window.clearTimeout(t); };
  }, [draft.fields, template.id, settings]);

  const setField = (key: string) => (v: string) => {
    setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: v } }));
    if (invalid.has(key)) setInvalid((s) => { const n = new Set(s); n.delete(key); return n; });
  };

  const send = async () => {
    if (sending) return;
    setError('');
    const missing = new Set(template.fields.filter((f) => f.required && !(draft.fields[f.key] || '').trim()).map((f) => f.key));
    if (!draft.to.trim()) missing.add('__to');
    if (!subject.trim()) missing.add('__subject');
    setInvalid(missing);
    if (missing.size) {
      setMode('write');
      setError(missing.has('__to') ? 'Add at least one recipient.' : 'Fill in the required fields.');
      triggerHaptic('error');
      return;
    }
    if (!settings?.configured) {
      setError(humanizeError('email_not_configured'));
      return;
    }
    setSending(true);
    try {
      await api.email.send({ template_id: template.id, fields: draft.fields, to: draft.to, cc: draft.cc, bcc: draft.bcc, subject });
      localStorage.removeItem(DRAFT_KEY(template.id));
      triggerHaptic('success');
      toast.success(`Email sent to ${draft.to.split(/[,;]/)[0].trim()}${draft.to.includes(',') ? ' and others' : ''}`);
      onSent();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'missing_field' && err.field) setInvalid(new Set([err.field]));
      setError(errorText(err, 'Could not send the email.'));
      triggerHaptic('error');
    } finally {
      setSending(false);
    }
  };

  const discard = () => {
    localStorage.removeItem(DRAFT_KEY(template.id));
    setDraft(emptyDraft());
    setInvalid(new Set());
    setError('');
  };

  const sendButton = (
    <button type="button" onClick={() => void send()} aria-disabled={sending || undefined} className={`btn filled${sending ? ' is-busy' : ''}`}>
      <span className="loading" aria-hidden="true" />
      {!sending && <Send className="i" aria-hidden="true" />}
      {sending ? 'Sending…' : 'Send'}
    </button>
  );

  const form = (
    <div className="grid gap-4">
      {!settings?.configured && (
        <div className="flex items-start gap-3 rounded-sm border border-warning/30 bg-warning-container p-3.5">
          <PlugZap className="i mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 flex-1 body-medium text-on-surface-variant">
            <p className="font-medium text-on-surface">Gmail is not connected yet</p>
            <p className="mt-0.5">You can write and preview now. Connect Gmail to send.</p>
          </div>
          <button type="button" onClick={onOpenSettings} className="btn outlined xs shrink-0">Set up</button>
        </div>
      )}
      <section className="panel grid gap-4 p-4" aria-label="Recipients">
        <div className={`field${invalid.has('__to') ? ' invalid' : ''}`}>
          <label htmlFor="email-to" className="field-label">To</label>
          {/* Outlined field with the Cc/Bcc toggle as a trailing text button inside it. */}
          <div className={`control no-lead${showCc ? '' : ' has-trail-text'}`}>
            <input id="email-to" type="email" inputMode="email" multiple value={draft.to} onChange={(e) => { setDraft((d) => ({ ...d, to: e.target.value })); setInvalid((s) => { const n = new Set(s); n.delete('__to'); return n; }); }} placeholder="name@example.com, other@example.com" autoComplete="email" />
            {!showCc && <button type="button" onClick={() => setShowCc(true)} className="btn text xs trail">Cc/Bcc</button>}
          </div>
        </div>
        {showCc && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="email-cc" className="field-label">Cc<span className="opt"> (optional)</span></label>
              <input id="email-cc" type="email" inputMode="email" multiple value={draft.cc} onChange={(e) => setDraft((d) => ({ ...d, cc: e.target.value }))} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="email-bcc" className="field-label">Bcc<span className="opt"> (optional)</span></label>
              <input id="email-bcc" type="email" inputMode="email" multiple value={draft.bcc} onChange={(e) => setDraft((d) => ({ ...d, bcc: e.target.value }))} autoComplete="off" />
            </div>
          </div>
        )}
        <div className={`field${invalid.has('__subject') ? ' invalid' : ''}`}>
          <label htmlFor="email-subject" className="field-label">Subject</label>
          <input id="email-subject" value={subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value, subjectTouched: true }))} placeholder={template.subject.replace(/\{\{|\}\}/g, '')} maxLength={250} />
          {draft.subjectTouched && (
            <button type="button" className="btn text xs -ml-3 self-start" onClick={() => setDraft((d) => ({ ...d, subjectTouched: false }))}>
              <Repeat className="i" aria-hidden="true" />Use suggested subject
            </button>
          )}
        </div>
      </section>
      <section className="panel grid gap-4 p-4" aria-label="Template content">
        {template.fields.map((f) => (
          <FieldInput key={f.key} field={f} value={draft.fields[f.key] || ''} onChange={setField(f.key)} invalid={invalid.has(f.key)} />
        ))}
        <p className="m-0 body-small text-on-surface-variant">
          Your name{settings?.signature ? ', signature' : ''} and address come from Settings › Email.
        </p>
      </section>
      {error && (
        <p role="alert" className="flex items-start gap-2 body-medium text-error">
          <CircleAlert className="i mt-px !h-4 !w-4 shrink-0" aria-hidden="true" />{error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={discard} className="btn text"><X className="i" aria-hidden="true" />Clear</button>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode('preview')} className="btn outlined lg:hidden"><Eye className="i" aria-hidden="true" />Preview</button>
          {sendButton}
        </div>
      </div>
    </div>
  );

  const preview = (
    <section aria-label="Email preview" className="min-w-0 overflow-hidden rounded-lg-inc border border-outline-variant bg-surface-container-lowest shadow-1">
      <div className="border-b border-outline-variant px-4 py-3 body-medium ">
        <p className="truncate text-on-surface-variant">From <span className="text-on-surface">{senderName || 'Your name'}{settings?.address ? ` <${settings.address}>` : ''}</span></p>
        <p className="truncate text-on-surface-variant">To <span className="text-on-surface">{draft.to || '—'}</span></p>
        <p className="truncate font-semibold text-on-surface">{subject || 'No subject'}</p>
      </div>
      <EmailFrame html={html} height={640} title="Email preview" interactive />
    </section>
  );

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="icon-btn shrink-0 " aria-label="Back to templates" data-tip="Back to templates">
          <ArrowLeft className="i" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate title-large text-on-surface">{template.name}</h2>
          <p className="truncate body-medium text-on-surface-variant">{template.tone} template</p>
        </div>
        <div className="shrink-0 max-lg:hidden">{sendButton}</div>
      </div>
      <ConnectedGroup
        className="lg:hidden"
        block
        ariaLabel="Compose view"
        size="xs"
        value={mode}
        onChange={setMode}
        options={[{ value: 'write', label: 'Write', icon: PencilLine }, { value: 'preview', label: 'Preview', icon: Eye }]}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className={`min-w-0 ${mode === 'write' ? '' : 'max-lg:hidden'}`}>{form}</div>
        <div className={`min-w-0 lg:sticky lg:top-0 ${mode === 'preview' ? '' : 'max-lg:hidden'}`}>
          {preview}
          <div className="mt-4 flex justify-end lg:hidden">{sendButton}</div>
        </div>
      </div>
    </div>
  );
}

function HistoryList({ items, templates, onReuse, onDelete }: {
  items: EmailHistoryItem[];
  templates: EmailTemplate[];
  onReuse: (item: EmailHistoryItem) => void;
  onDelete: (item: EmailHistoryItem) => void;
}) {
  if (!items.length) {
    return <EmptyState icon={MailCheck} title="Nothing sent yet" hint="Emails you send from a template show up here, ready to reuse." />;
  }
  return (
    <ul className="panel m-0 list-none divide-y divide-outline-variant p-0">
      {items.map((item) => {
        const t = templates.find((x) => x.id === item.template_id);
        const failed = item.status !== 'sent';
        return (
          <li key={item.id} className="flex items-start gap-3 px-4 py-3.5">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t?.accent || 'var(--neutral)' }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate title-small text-on-surface">{item.subject}</p>
              <p className="mt-0.5 truncate body-medium text-on-surface-variant">To {item.to}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`status ${failed ? 't-error' : 't-success'}`}><span className="dot" />{failed ? 'Failed' : 'Sent'}</span>
                {t && <span className="tag">{t.name}</span>}
                <span className="body-small text-on-surface-variant" title={fmtFull(item.created_at)}>{fmtRelative(item.created_at)}</span>
              </div>
              {failed && item.error && <p className="mt-1.5 body-small text-error">{humanizeError(item.error) === humanizeError() ? item.error : humanizeError(item.error)}</p>}
            </div>
            <div className="actions -my-1 flex shrink-0">
              {t && (
                <button type="button" onClick={() => onReuse(item)} className="icon-btn " aria-label={`Use again: ${item.subject}`} data-tip="Use again">
                  <Repeat className="i" aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={() => onDelete(item)} className="icon-btn danger " aria-label="Delete from history" data-tip="Delete from history">
                <Trash2 className="i" aria-hidden="true" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function EmailView({ onOpenSettings, settingsVersion = 0 }: { onOpenSettings: () => void; settingsVersion?: number }) {
  const toast = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [history, setHistory] = useState<EmailHistoryItem[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [section, setSection] = useState<'templates' | 'sent'>('templates');
  const [tone, setTone] = useState<ToneFilter>('All');
  const [composing, setComposing] = useState<{ template: EmailTemplate; initial?: Partial<Draft> } | null>(null);
  const [deleting, setDeleting] = useState<EmailHistoryItem | null>(null);

  useBackHandler(!!composing, () => setComposing(null));

  const loadHistory = useCallback(() => api.email.history().then(setHistory).catch(() => setHistory([])), []);

  useEffect(() => {
    let alive = true;
    setLoadError('');
    Promise.all([api.email.templates(), api.email.settings()])
      .then(([t, s]) => { if (alive) { setTemplates(t); setSettings(s); } })
      .catch((e) => alive && setLoadError(errorText(e, 'Could not load email templates.')));
    void loadHistory();
    return () => { alive = false; };
  }, [settingsVersion, loadHistory]);

  const shown = useMemo(() => (templates || []).filter((t) => tone === 'All' || t.tone === tone), [templates, tone]);

  if (composing) {
    return (
      <Compose
        key={composing.template.id}
        template={composing.template}
        initial={composing.initial}
        settings={settings}
        onBack={() => setComposing(null)}
        onOpenSettings={onOpenSettings}
        onSent={() => { setComposing(null); setSection('sent'); void loadHistory(); }}
      />
    );
  }

  const removeHistory = async () => {
    if (!deleting) return;
    try {
      await api.email.removeHistory(deleting.id);
      setHistory((h) => (h || []).filter((x) => x.id !== deleting.id));
      toast.success('Removed from history');
    } catch {
      toast.error('Could not remove it');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="w-full space-y-5">
      <div className="min-w-0">
        <h2 className="title-large text-on-surface">Email templates</h2>
        <p className="mt-0.5 body-medium text-on-surface-variant">Pick a design, fill in the details and send it from your Gmail.</p>
      </div>

      {settings && !settings.configured && (
        <div className="flex items-start gap-3 rounded-lg-inc border border-outline-variant bg-surface-container-lowest p-4 shadow-1">
          <span className="shape-icon t-warning shrink-0"><Mail className="i" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="title-small text-on-surface">Connect your Gmail</p>
            <p className="mt-0.5 body-medium text-on-surface-variant">A two-minute, one-time setup with Google Apps Script. No passwords stored.</p>
          </div>
          <button type="button" onClick={onOpenSettings} className="btn filled xs shrink-0">Set up</button>
        </div>
      )}

      <ConnectedGroup
        ariaLabel="Email sections"
        size="xs"
        value={section}
        onChange={setSection}
        options={[{ value: 'templates', label: 'Templates', icon: Mail }, { value: 'sent', label: history && history.length ? `Sent · ${history.length}` : 'Sent', icon: MailCheck }]}
      />

      {loadError ? (
        <div role="alert" className="flex items-start gap-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-3.5 body-medium text-on-surface-variant">
          <CircleAlert className="i mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          <p>{loadError} Pull down to try again.</p>
        </div>
      ) : section === 'templates' ? (
        <>
          <div role="group" aria-label="Filter by tone" className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar lg:mx-0 lg:px-0">
            {TONES.map((t) => (
              <button key={t} type="button" aria-pressed={tone === t} onClick={() => { triggerHaptic('light'); setTone(t); }} className={`chip shrink-0${tone === t ? ' on' : ''}`}>
                <span className="chip-label">{t}</span>
              </button>
            ))}
          </div>
          {!templates ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[290px] w-full rounded-lg-inc" />)}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((t) => <TemplateCard key={t.id} template={t} onOpen={() => setComposing({ template: t })} />)}
            </div>
          )}
        </>
      ) : !history ? (
        <Skeleton className="h-40 w-full rounded-lg-inc" />
      ) : (
        <HistoryList
          items={history}
          templates={templates || []}
          onReuse={(item) => {
            const t = (templates || []).find((x) => x.id === item.template_id);
            if (t) setComposing({ template: t, initial: { to: item.to, cc: item.cc, bcc: item.bcc, subject: item.subject, subjectTouched: true, fields: item.fields } });
          }}
          onDelete={setDeleting}
        />
      )}

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void removeHistory()}
        title="Remove from history?"
        message={`“${deleting?.subject}” will be removed from your sent list. The email itself stays in Gmail.`}
        confirmLabel="Remove"
      />
    </div>
  );
}
