import React, { useEffect, useRef, useState } from 'react';
import { Shield, ShieldCheck, ShieldOff, KeyRound, Lock, Sparkles, Mail } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { CopyButton } from '../ui/CopyButton';
import { api, humanizeError, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { TotpSetupResponse } from '../../types';
import { AgentSettingsPanel } from '../../features/agent/AgentSettingsPanel';
import { EmailSettingsPanel } from '../../features/email/EmailSettingsPanel';
import { ConnectedGroup } from '../ui/ConnectedGroup';

export type SettingsTab = 'security' | 'agent' | 'email';
const TABS: SettingsTab[] = ['security', 'agent', 'email'];

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAgentConfigured?: () => void;
  /** Tab to show when the modal opens (defaults to Security). */
  initialTab?: SettingsTab;
  onEmailSaved?: () => void;
}

type Step = 'status' | 'enroll' | 'recovery' | 'disable';
type FieldHint = { verify?: string; password?: string; code?: string };

export function SecurityModal({ isOpen, onClose, onAgentConfigured, initialTab = 'security', onEmailSaved }: SecurityModalProps) {
  const { totpEnabled, setTotpStatus } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<Step>('status');
  const [enrollData, setEnrollData] = useState<TotpSetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldHint, setFieldHint] = useState<FieldHint>({});
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [agentSaving, setAgentSaving] = useState(false);
  const agentSavingRef = useRef(false);
  const securityTabRef = useRef<HTMLButtonElement>(null);
  const agentTabRef = useRef<HTMLButtonElement>(null);
  const emailTabRef = useRef<HTMLButtonElement>(null);
  const tabRefs = { security: securityTabRef, agent: agentTabRef, email: emailTabRef };

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
    } else {
      setAgentSaving(false);
      agentSavingRef.current = false;
    }
  }, [isOpen, initialTab]);

  function changeTab(nextTab: SettingsTab, focus = false) {
    if (agentSavingRef.current) return;
    setTab(nextTab);
    if (focus) tabRefs[nextTab].current?.focus();
  }

  function handleTabKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (agentSavingRef.current) return;
    const i = TABS.indexOf(tab);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      changeTab(TABS[(i + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length], true);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      changeTab(event.key === 'Home' ? TABS[0] : TABS[TABS.length - 1], true);
    }
  }

  const startEnroll = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.twofa.setup();
      setEnrollData(data);
      setStep('enroll');
    } catch (err: any) {
      toast.error('Failed to initialize 2FA setup');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.twofa.enable(verifyCode.trim());
      setTotpStatus(true);
      setRecoveryCodes(res.recovery_codes || []);
      setStep('recovery');
      toast.success('Two-factor authentication enabled');
    } catch (err: any) {
      setError(err instanceof ApiError ? humanizeError(err.code) : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.twofa.disable(disablePassword, disableCode.trim());
      setTotpStatus(false);
      setStep('status');
      toast.success('Two-factor authentication disabled');
    } catch (err: any) {
      setError(err instanceof ApiError ? humanizeError(err.code) : 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    if (agentSavingRef.current) return;
    setStep('status');
    setEnrollData(null);
    setVerifyCode('');
    setRecoveryCodes([]);
    setDisablePassword('');
    setDisableCode('');
    setError(null);
    setFieldHint({});
    onClose();
  };

  const submitVerify = (e: React.FormEvent) => {
    if (loading) { e.preventDefault(); return; }
    if (verifyCode.trim().length < 6) {
      e.preventDefault();
      setFieldHint({ verify: 'Enter the 6-digit code from your authenticator app.' });
      return;
    }
    setFieldHint({});
    void handleVerifyEnroll(e);
  };

  const submitDisable = (e: React.FormEvent) => {
    if (loading) { e.preventDefault(); return; }
    const hint: FieldHint = {};
    if (!disablePassword) hint.password = 'Enter your password.';
    if (!disableCode.trim()) hint.code = 'Enter a 6-digit code or a recovery code.';
    setFieldHint(hint);
    if (hint.password || hint.code) { e.preventDefault(); return; }
    void handleDisable(e);
  };

  const tabClass = (active: boolean) => `chip flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-60${active ? ' on' : ''}`;
  const busy = (extra: string) => `btn ${extra}${loading ? ' is-busy' : ''}`;

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title="Settings" maxWidth="max-w-[480px]">
      <ConnectedGroup
        className="mb-6"
        block
        ariaLabel="Settings sections"
        size="xs"
        value={tab}
        onChange={(t) => changeTab(t)}
        options={[{ value: 'security', label: 'Security', icon: Shield }, { value: 'agent', label: 'AI agent', icon: Sparkles }, { value: 'email', label: 'Email', icon: Mail }]}
      />
      <div id="settings-email-panel" role="region" aria-label="email settings" hidden={tab !== 'email'} className="rounded-sm">
        {isOpen && tab === 'email' && <EmailSettingsPanel onSavingChange={saving => { agentSavingRef.current = saving; setAgentSaving(saving); }} onCancel={resetAndClose} onSaved={() => onEmailSaved?.()} />}
      </div>
      <div id="settings-agent-panel" role="region" aria-label="agent settings" hidden={tab !== 'agent'} className="rounded-sm">
        {isOpen && tab === 'agent' && <AgentSettingsPanel onSavingChange={saving => { agentSavingRef.current = saving; setAgentSaving(saving); }} onCancel={resetAndClose} onConfigured={() => { onAgentConfigured?.(); resetAndClose(); }} />}
      </div>
      <div id="settings-security-panel" role="region" aria-label="security settings" hidden={tab !== 'security'} className="rounded-sm">
      {tab === 'security' && <>
      {/* Step 1: Current Status */}
      {step === 'status' && (
        <section aria-labelledby="twofa-title" className="grid gap-5">
          <div className="flex items-start gap-3">
            <span className={`shape-icon mt-0.5 ${totpEnabled ? 't-success' : 't-neutral'}`}>
              {totpEnabled ? <ShieldCheck className="i" aria-hidden="true" /> : <Shield className="i" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <h4 id="twofa-title" className="title-medium text-on-surface">Two-factor authentication</h4>
                <span className={`status ${totpEnabled ? 't-success' : 't-neutral'}`}><span className="dot" />{totpEnabled ? 'Active' : 'Disabled'}</span>
              </div>
              <p className="mt-1 body-medium text-on-surface-variant">
                {totpEnabled
                  ? 'You will enter a 6-digit code from your authenticator app at sign in.'
                  : 'Protect your account by requiring an authenticator code at sign in.'}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-outline-variant pt-4">
            {totpEnabled ? (
              <button type="button" onClick={() => setStep('disable')} className="btn danger-text">
                <ShieldOff className="i" aria-hidden="true" />
                Disable two-factor authentication
              </button>
            ) : (
              <button
                type="button"
                aria-disabled={loading ? true : undefined}
                onClick={() => { if (!loading) void startEnroll(); }}
                className={busy('filled')}
              >
                <span className="loading" aria-hidden="true" />
                {loading ? 'Setting up…' : 'Enable two-factor authentication'}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Step 2: Enroll with QR / Secret Key */}
      {step === 'enroll' && enrollData && (
        <form onSubmit={submitVerify} noValidate aria-busy={loading} className="grid gap-5" aria-labelledby="enroll-title">
          <div>
            <h4 id="enroll-title" className="title-medium text-on-surface">Set up your authenticator</h4>
            <p className="mt-1 body-medium text-on-surface-variant">Scan the QR code with your authenticator app, or enter the setup key.</p>
          </div>

          {enrollData.qr_svg && (
            <div
              className="mx-auto h-48 w-48 overflow-hidden rounded-sm border border-outline-variant [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
              aria-label="QR code for your authenticator app"
              role="img"
              dangerouslySetInnerHTML={{ __html: enrollData.qr_svg }}
            />
          )}

          <div className="field">
            <span className="field-label">Setup key</span>
            <div className="linkbox">
              <span className="font-mono tabular text-on-surface">{enrollData.secret_b32}</span>
              <CopyButton text={enrollData.secret_b32} ariaLabel="Copy setup key" />
            </div>
          </div>

          <div className={`field border-t border-outline-variant pt-5${fieldHint.verify || error ? ' invalid' : ''}`}>
            <label className="field-label" htmlFor="twofa-verify-code">6-digit verification code</label>
            <div className="control">
              <KeyRound className="i lead" aria-hidden="true" />
              <input
                id="twofa-verify-code"
                type="text"
                value={verifyCode}
                onChange={(e) => {
                  setVerifyCode(e.target.value);
                  if (error) setError(null);
                  if (fieldHint.verify && e.target.value.trim().length >= 6) setFieldHint({});
                }}
                placeholder="123456"
                maxLength={6}
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-invalid={fieldHint.verify || error ? true : undefined}
                aria-describedby="twofa-verify-error"
                className="font-mono tabular body-large "
              />
            </div>
            <p className="field-error m-0" id="twofa-verify-error" aria-live="polite">{fieldHint.verify || error || ''}</p>
          </div>

          <div className="flex justify-end gap-2 border-t border-outline-variant pt-4">
            <button type="button" onClick={() => { setFieldHint({}); setError(null); setStep('status'); }} className="btn text">
              Back
            </button>
            <button type="submit" aria-disabled={loading ? true : undefined} className={busy('filled')}>
              <span className="loading" aria-hidden="true" />
              {loading ? 'Verifying…' : 'Verify and enable'}
            </button>
          </div>
        </form>
      )}

      {/* Step 3: Recovery Codes */}
      {step === 'recovery' && (
        <section aria-labelledby="recovery-title" className="grid gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h4 id="recovery-title" className="title-medium text-on-surface">Save your recovery codes</h4>
              <span className="status t-success"><ShieldCheck className="i" aria-hidden="true" />2FA enabled</span>
            </div>
            <p className="mt-1 body-medium text-on-surface-variant">
              Save these one-time recovery codes in a secure password manager. Each code can be used once if you lose access to your device.
            </p>
          </div>

          <div>
            <div className="grid grid-cols-2 gap-2 rounded-sm bg-surface-container-high p-3 font-mono tabular body-medium">
              {recoveryCodes.map((code) => (
                <div key={code} className="rounded-sm border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-center text-on-surface select-text">
                  {code}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-end gap-1 body-medium text-on-surface-variant">
              <span>Copy all codes</span>
              <CopyButton text={recoveryCodes.join('\n')} ariaLabel="Copy all recovery codes" />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-outline-variant pt-4">
            <button type="button" onClick={resetAndClose} className="btn filled">
              Done
            </button>
          </div>
        </section>
      )}

      {/* Step 4: Disable 2FA */}
      {step === 'disable' && (
        <form onSubmit={submitDisable} noValidate aria-busy={loading} className="grid gap-5" aria-labelledby="disable-title">
          <div>
            <h4 id="disable-title" className="title-medium text-on-surface">Disable two-factor authentication?</h4>
            <p className="mt-1 body-medium text-on-surface-variant">
              Confirm your password and a current authenticator code to turn off 2FA.
            </p>
          </div>

          <div className="fields">
            <div className={`field${fieldHint.password ? ' invalid' : ''}`}>
              <label className="field-label" htmlFor="twofa-disable-password">Password</label>
              <div className="control">
                <Lock className="i lead" aria-hidden="true" />
                <input
                  id="twofa-disable-password"
                  type="password"
                  value={disablePassword}
                  onChange={(e) => {
                    setDisablePassword(e.target.value);
                    if (error) setError(null);
                    if (fieldHint.password && e.target.value) setFieldHint((h) => ({ ...h, password: undefined }));
                  }}
                  required
                  autoComplete="current-password"
                  aria-invalid={fieldHint.password ? true : undefined}
                  aria-describedby="twofa-disable-password-error"
                />
              </div>
              <p className="field-error m-0" id="twofa-disable-password-error" aria-live="polite">{fieldHint.password || ''}</p>
            </div>

            <div className={`field${fieldHint.code || error ? ' invalid' : ''}`}>
              <label className="field-label" htmlFor="twofa-disable-code">6-digit code or recovery code</label>
              <div className="control">
                <KeyRound className="i lead" aria-hidden="true" />
                <input
                  id="twofa-disable-code"
                  type="text"
                  value={disableCode}
                  onChange={(e) => {
                    setDisableCode(e.target.value);
                    if (error) setError(null);
                    if (fieldHint.code && e.target.value.trim()) setFieldHint((h) => ({ ...h, code: undefined }));
                  }}
                  placeholder="123456 or xxxx-xxxx"
                  required
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={fieldHint.code || error ? true : undefined}
                  aria-describedby="twofa-disable-code-error"
                  className="font-mono tabular"
                />
              </div>
              <p className="field-error m-0" id="twofa-disable-code-error" aria-live="polite">{fieldHint.code || error || ''}</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-outline-variant pt-4">
            <button type="button" onClick={() => { setFieldHint({}); setError(null); setStep('status'); }} className="btn text">
              Keep 2FA on
            </button>
            <button type="submit" aria-disabled={loading ? true : undefined} className={busy('danger')}>
              <span className="loading" aria-hidden="true" />
              {loading ? 'Disabling…' : 'Disable 2FA'}
            </button>
          </div>
        </form>
      )}
      </>}
      </div>
    </Modal>
  );
}
