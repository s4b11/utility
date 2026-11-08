import { useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2, RotateCw, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { agentError } from './AgentDetails';

interface AgentSettingsPanelProps {
  onConfigured?: () => void;
  onSavingChange?: (saving: boolean) => void;
  onCancel?: () => void;
}

export function AgentSettingsPanel({ onConfigured, onSavingChange, onCancel }: AgentSettingsPanelProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [keyHint, setKeyHint] = useState('');
  const keyInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const saveInProgress = useRef(false);
  const loadVersion = useRef(0);
  const toast = useToast();

  async function loadSettings() {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError('');
    try {
      const settings = await api.agent.settings();
      if (mounted.current && version === loadVersion.current) setConfigured(settings.configured);
    } catch (error) {
      if (mounted.current && version === loadVersion.current) setLoadError(agentError(error));
    } finally {
      if (mounted.current && version === loadVersion.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void loadSettings();
    return () => {
      mounted.current = false;
      loadVersion.current += 1;
    };
  }, []);

  async function configure() {
    if (!key.trim() || saveInProgress.current || loading || loadError) return;
    saveInProgress.current = true;
    setSaving(true);
    setSaveError('');
    onSavingChange?.(true);
    let success = false;
    try {
      const settings = await api.agent.configure(key.trim());
      if (!mounted.current) return;
      setConfigured(settings.configured);
      if (!settings.configured) {
        setSaveError('Groq could not be connected. Please try again.');
        return;
      }
      setKey('');
      success = true;
      toast.success('Groq connected. You can start chatting.');
    } catch (error) {
      if (mounted.current) setSaveError(agentError(error));
    } finally {
      saveInProgress.current = false;
      if (mounted.current) {
        setSaving(false);
        onSavingChange?.(false);
      }
    }
    if (success && mounted.current) onConfigured?.();
  }

  function submit() {
    if (saveInProgress.current || loading || loadError) return;
    if (!key.trim()) {
      setKeyHint('Enter your Groq API key.');
      keyInput.current?.focus();
      return;
    }
    setKeyHint('');
    void configure();
  }

  const keyError = keyHint || saveError;

  return (
    <form onSubmit={event => { event.preventDefault(); submit(); }} noValidate className="grid gap-5" aria-label="AI Agent configuration" aria-busy={saving}>
      <div className="flex items-start gap-3">
        <span className={`shape-icon mt-0.5 ${configured && !loading && !loadError ? 't-success' : 't-neutral'}`}><Sparkles className="i" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <h4 className="title-medium text-on-surface">Groq · GPT OSS 20B</h4>
            {!loading && !loadError && (configured
              ? <span className="status t-success"><span className="dot" />Connected</span>
              : <span className="status t-neutral"><span className="dot" />Not connected</span>)}
          </div>
          <p className="mt-1 body-medium text-on-surface-variant">Connect Groq to ask questions about your saved items and create items with the AI Agent.</p>
        </div>
      </div>

      {loading && <p role="status" className="flex items-center gap-2 body-medium text-on-surface-variant"><Loader2 className="i h-4 w-4 animate-spin" aria-hidden="true" />Checking connection…</p>}
      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-outline-variant bg-surface-container-high px-3.5 py-3">
          <p className="min-w-0 flex-1 body-medium text-error">{loadError}</p>
          <button type="button" onClick={() => void loadSettings()} className="btn outlined"><RotateCw className="i" aria-hidden="true" />Try again</button>
        </div>
      )}
      {!loading && !loadError && (
        <div className={`field${keyError ? ' invalid' : ''}`}>
          <label htmlFor="groq-key" className="field-label">Groq API key</label>
          <div className="control">
            <KeyRound className="i lead" aria-hidden="true" />
            <input ref={keyInput} id="groq-key" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={key} onChange={event => { setKey(event.target.value); if (keyHint && event.target.value.trim()) setKeyHint(''); }} disabled={saving} placeholder="gsk_…" maxLength={256} aria-invalid={keyError ? true : undefined} aria-describedby={keyError ? 'groq-key-error groq-key-help' : 'groq-key-help'} className="font-mono disabled:cursor-progress disabled:bg-surface-container-high disabled:text-on-surface-variant" />
          </div>
          {keyHint && <p id="groq-key-error" className="field-error m-0" aria-live="polite">{keyHint}</p>}
          {!keyHint && saveError && <p id="groq-key-error" role="alert" className="field-error m-0">{saveError}</p>}
          <p id="groq-key-help" className="m-0 body-small text-on-surface-variant">{configured ? 'Enter a new key to replace the saved key. ' : ''}Your key is encrypted on your server. The saved key is never displayed or saved on this device.</p>
        </div>
      )}
      {(loading || loadError) && saveError && <p role="alert" className="field-error m-0">{saveError}</p>}
      <div className="flex justify-end gap-2 border-t border-outline-variant pt-4">
        <button type="button" aria-disabled={saving ? true : undefined} onClick={() => { if (!saveInProgress.current) { setKey(''); onCancel?.(); } }} className="btn text">Cancel</button>
        {!loadError && (
          <button type="submit" aria-disabled={saving || loading ? true : undefined} className={`btn filled${saving ? ' is-busy' : ''}`}>
            <span className="loading" aria-hidden="true" />
            {saving ? 'Saving…' : configured ? 'Update key' : 'Connect Groq'}
          </button>
        )}
      </div>
    </form>
  );
}
