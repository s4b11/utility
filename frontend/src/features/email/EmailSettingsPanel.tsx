import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, ExternalLink, KeyRound, Mail, PlugZap, RotateCw, Send } from 'lucide-react';
import { api, ApiError, humanizeError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { CopyButton } from '../../components/ui/CopyButton';
import { openExternal } from '../../lib/openExternal';
import type { EmailSettings } from '../../types';

interface EmailSettingsPanelProps {
  onSavingChange?: (saving: boolean) => void;
  onCancel?: () => void;
  onSaved?: (settings: EmailSettings) => void;
}

function errorText(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const base = humanizeError(error.code);
    return error.code === 'relay_failed' && error.detail ? `${base} ${error.detail}` : base;
  }
  return fallback;
}

/**
 * Settings > Email: the sender profile (name, Gmail address, reply-to, signature) and the
 * Google Apps Script relay that actually sends through Gmail. Fermyon Cloud can only make
 * HTTPS requests, so instead of an SMTP app password the owner deploys a tiny script on
 * their own Google account; this panel hands them that script with the secret baked in.
 */
export function EmailSettingsPanel({ onSavingChange, onCancel, onSaved }: EmailSettingsPanelProps) {
  const toast = useToast();
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ from_name: '', address: '', reply_to: '', signature: '', relay_url: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [check, setCheck] = useState<{ state: 'idle' | 'busy' | 'ok' | 'error'; text?: string }>({ state: 'idle' });
  const [testing, setTesting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const mounted = useRef(true);

  const apply = (s: EmailSettings) => {
    setSettings(s);
    setForm({ from_name: s.from_name, address: s.address, reply_to: s.reply_to, signature: s.signature, relay_url: s.relay_url });
  };

  const load = async () => {
    setLoadError('');
    try {
      const s = await api.email.settings();
      if (mounted.current) apply(s);
    } catch (e) {
      if (mounted.current) setLoadError(errorText(e, 'Could not load email settings.'));
    }
  };

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const dirty = !!settings && (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== settings[k]);

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    onSavingChange?.(true);
    try {
      const s = await api.email.updateSettings(form);
      if (!mounted.current) return;
      apply(s);
      onSaved?.(s);
      toast.success('Email settings saved');
    } catch (err) {
      if (mounted.current) setError(errorText(err, 'Could not save email settings.'));
    } finally {
      if (mounted.current) setSaving(false);
      onSavingChange?.(false);
    }
  };

  const regenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const s = await api.email.updateSettings({ regenerate_secret: true });
      if (!mounted.current) return;
      setSettings(s);
      setCheck({ state: 'idle' });
      toast.success('New secret created. Paste the updated script into Apps Script and redeploy.');
    } catch (err) {
      toast.error(errorText(err, 'Could not create a new secret.'));
    } finally {
      if (mounted.current) setRegenerating(false);
    }
  };

  const runCheck = async () => {
    if (dirty) await save();
    setCheck({ state: 'busy' });
    try {
      const res = await api.email.ping();
      if (!mounted.current) return;
      const quota = typeof res.remaining === 'number' ? ` · ${res.remaining} emails left today` : '';
      setCheck({ state: 'ok', text: `Connected${res.email ? ` as ${res.email}` : ''}${quota}` });
    } catch (err) {
      if (mounted.current) setCheck({ state: 'error', text: errorText(err, 'Could not reach the relay.') });
    }
  };

  const sendTest = async () => {
    if (testing) return;
    if (dirty) await save();
    setTesting(true);
    try {
      const res = await api.email.sendTest(form.address || undefined);
      toast.success(`Test email sent to ${res.to}`);
    } catch (err) {
      toast.error(errorText(err, 'Could not send the test email.'));
    } finally {
      if (mounted.current) setTesting(false);
    }
  };

  if (loadError) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-sm border border-outline-variant bg-surface-container-lowest p-3.5 body-medium text-on-surface-variant">
        <CircleAlert className="i mt-0.5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p>{loadError}</p>
          <button type="button" onClick={() => void load()} className="btn outlined xs mt-2.5"><RotateCw className="i" aria-hidden="true" />Try again</button>
        </div>
      </div>
    );
  }
  if (!settings) {
    return <p role="status" className="flex items-center gap-2 py-6 body-medium text-on-surface-variant"><span className="loading xs" aria-hidden="true" />Loading email settings…</p>;
  }

  const secretTail = settings.relay_secret.slice(-6);

  return (
    <form onSubmit={save} className="grid gap-6" aria-busy={saving || undefined}>
      <section aria-labelledby="email-profile-title" className="grid gap-4">
        <div className="flex items-start gap-3">
          <span className="shape-icon t-primary mt-0.5"><Mail className="i" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h4 id="email-profile-title" className="title-medium text-on-surface">Sender details</h4>
            <p className="mt-0.5 body-medium text-on-surface-variant">Shown on every template you send.</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="email-from-name" className="field-label">Your name</label>
          <input id="email-from-name" value={form.from_name} onChange={set('from_name')} placeholder="Sabith S B" autoComplete="name" maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="email-address" className="field-label">Your Gmail address</label>
          <input id="email-address" type="email" inputMode="email" value={form.address} onChange={set('address')} placeholder="you@gmail.com" autoComplete="email" />
          <p className="m-0 body-small text-on-surface-variant">Emails go out from the Google account that runs your relay script.</p>
        </div>
        <div className="field">
          <label htmlFor="email-reply-to" className="field-label">Reply-to<span className="opt"> (optional)</span></label>
          <input id="email-reply-to" type="email" inputMode="email" value={form.reply_to} onChange={set('reply_to')} placeholder="replies@yourdomain.com" />
        </div>
        <div className="field">
          <label htmlFor="email-signature" className="field-label">Signature<span className="opt"> (optional)</span></label>
          <textarea id="email-signature" rows={3} value={form.signature} onChange={set('signature')} placeholder={'Sabith S B\nProduct Engineer · +91 98765 43210'} maxLength={1000} />
        </div>
      </section>

      <section aria-labelledby="email-relay-title" className="grid gap-4 border-t border-outline-variant pt-5">
        <div className="flex items-start gap-3">
          <span className={`shape-icon mt-0.5 ${settings.configured ? 't-success' : 't-warning'}`}><PlugZap className="i" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h4 id="email-relay-title" className="title-medium text-on-surface">Gmail relay</h4>
              <span className={`status ${settings.configured ? 't-success' : 't-warning'}`}><span className="dot" />{settings.configured ? 'Set up' : 'Not set up'}</span>
            </div>
            <p className="mt-0.5 body-medium text-on-surface-variant">
              utility sends through a small Google Apps Script on your account, so no Gmail password or app password is stored here.
            </p>
          </div>
        </div>

        <ol className="grid gap-3 rounded-sm bg-surface-container-high p-4 body-medium text-on-surface-variant">
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-container-lowest label-medium text-on-surface">1</span>
            <span className="min-w-0 flex-1">
              Copy your relay script. It already contains your secret.
              <span className="mt-2 flex items-center gap-2">
                <CopyButton text={settings.script_code} ariaLabel="Copy relay script" className="!h-9 !w-9 border border-outline bg-surface-container-lowest" />
                <span className="body-small text-on-surface-variant">Copy script · secret ends in <span className="font-mono text-on-surface-variant">…{secretTail}</span></span>
              </span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-container-lowest label-medium text-on-surface">2</span>
            <span className="min-w-0 flex-1">
              Open{' '}
              <a href="https://script.new" target="_blank" rel="noreferrer" onClick={openExternal} className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2">
                script.new<ExternalLink className="i !h-3.5 !w-3.5" aria-hidden="true" />
              </a>{' '}
              signed in to your Gmail, paste the script over everything and save.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-container-lowest label-medium text-on-surface">3</span>
            <span className="min-w-0 flex-1">
              <b className="font-medium text-on-surface">Deploy › New deployment › Web app</b>, with <b className="font-medium text-on-surface">Execute as: Me</b> and{' '}
              <b className="font-medium text-on-surface">Who has access: Anyone</b>. Authorise it, then paste the web app URL below.
            </span>
          </li>
        </ol>

        <div className="field">
          <label htmlFor="email-relay-url" className="field-label">Web app URL</label>
          <input
            id="email-relay-url"
            type="url"
            inputMode="url"
            value={form.relay_url}
            onChange={set('relay_url')}
            placeholder={`${settings.relay_origin}/macros/s/…/exec`}
            autoComplete="off"
            spellCheck={false}
            className="font-mono !body-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void runCheck()} aria-disabled={check.state === 'busy' || !form.relay_url || undefined} className={`btn outlined xs${check.state === 'busy' ? ' is-busy' : ''}`}>
            <span className="loading" aria-hidden="true" />{check.state !== 'busy' && <PlugZap className="i" aria-hidden="true" />}Check connection
          </button>
          <button type="button" onClick={() => void sendTest()} aria-disabled={testing || !settings.configured || undefined} className={`btn outlined xs${testing ? ' is-busy' : ''}`}>
            <span className="loading" aria-hidden="true" />{!testing && <Send className="i" aria-hidden="true" />}Send test email
          </button>
          <button type="button" onClick={() => void regenerate()} aria-disabled={regenerating || undefined} className={`btn text xs${regenerating ? ' is-busy' : ''}`}>
            <span className="loading" aria-hidden="true" />{!regenerating && <KeyRound className="i" aria-hidden="true" />}New secret
          </button>
        </div>
        {check.state === 'ok' && <p role="status" className="flex items-center gap-2 body-medium text-success"><CheckCircle2 className="i !h-4 !w-4" aria-hidden="true" />{check.text}</p>}
        {check.state === 'error' && <p role="alert" className="flex items-start gap-2 body-medium text-error"><CircleAlert className="i mt-px !h-4 !w-4 shrink-0" aria-hidden="true" />{check.text}</p>}
      </section>

      {error && <p role="alert" className="field-error m-0">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-outline-variant pt-4">
        {onCancel && <button type="button" onClick={onCancel} className="btn text">Close</button>}
        <button type="submit" aria-disabled={saving || !dirty || undefined} className={`btn filled${saving ? ' is-busy' : ''}`}>
          <span className="loading" aria-hidden="true" />{saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
