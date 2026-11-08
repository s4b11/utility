import React, { useRef, useState } from 'react';
import { Eye, EyeOff, User, Lock, KeyRound, Check } from 'lucide-react';
import { api, humanizeError, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Brand } from '../ui/BrandMark';

type FieldErrors = { username?: string; password?: string; code?: string };

export function LoginView() {
  const { login } = useAuth();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // 2FA state
  const [needTotp, setNeedTotp] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const busyRef = useRef(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyRef.current) return;
    setError(null);

    // Client-side checks replace the native `required` bubbles (the form is `noValidate`).
    const nextErrors: FieldErrors = {};
    if (!username.trim()) nextErrors.username = 'Enter your username.';
    if (!password) nextErrors.password = 'Enter your password.';
    if (needTotp && !totpCode.trim()) {
      nextErrors.code = useRecovery ? 'Enter a recovery code.' : 'Enter the 6-digit code from your authenticator app.';
    }
    setFieldErrors(nextErrors);
    if (nextErrors.username) { usernameRef.current?.focus(); return; }
    if (nextErrors.password) { passwordRef.current?.focus(); return; }
    if (nextErrors.code) { codeRef.current?.focus(); return; }

    busyRef.current = true;
    setLoading(true);

    try {
      const payload: any = {
        username: username.trim(),
        password,
        remember,
      };

      if (needTotp) {
        if (useRecovery) {
          payload.recovery = totpCode.trim();
        } else {
          payload.totp = totpCode.trim();
        }
      }

      const session = await api.login(payload);
      toast.success('Signed in successfully');
      login(session);
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'totp_required') {
        setNeedTotp(true);
        setError(null);
      } else {
        setError(err instanceof ApiError ? humanizeError(err.code) : 'Login failed');
        (needTotp ? codeRef : passwordRef).current?.focus();
      }
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  // A rejected sign-in shows its message under the field it concerns.
  const passwordError = fieldErrors.password || (!needTotp && error) || '';
  const codeError = fieldErrors.code || (needTotp && error) || '';

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-on-surface safe-pt safe-pb safe-pl safe-pr">
      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-10 sm:pb-24">
        <div className="form-card">
          <div className="form-card-head">
            <Brand className="mb-6 justify-center" />
            <h1 className="form-card-title">Sign in</h1>
            <p className="form-card-sub">Enter your credentials to access your toolbox.</p>
          </div>
          <form method="post" noValidate onSubmit={handleSubmit} aria-busy={loading}>

            <div className="fields">
              <div className={`field${fieldErrors.username ? ' invalid' : ''}`}>
                <label className="field-label" htmlFor="login-username">Username</label>
                <div className="control">
                  <User className="i lead" aria-hidden="true" />
                  <input
                    ref={usernameRef}
                    id="login-username"
                    name="username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (fieldErrors.username && e.target.value.trim()) setFieldErrors((f) => ({ ...f, username: undefined }));
                      if (error && !needTotp) setError(null);
                    }}
                    placeholder="Your username"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={fieldErrors.username ? true : undefined}
                    aria-describedby="login-username-error"
                  />
                </div>
                <p className="field-error m-0" id="login-username-error" aria-live="polite">{fieldErrors.username || ''}</p>
              </div>

              <div className={`field${passwordError ? ' invalid' : ''}`}>
                <label className="field-label" htmlFor="login-password">Password</label>
                <div className="control has-trail">
                  <Lock className="i lead" aria-hidden="true" />
                  <input
                    ref={passwordRef}
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password && e.target.value) setFieldErrors((f) => ({ ...f, password: undefined }));
                      if (error && !needTotp) setError(null);
                    }}
                    placeholder="Your password"
                    required
                    autoComplete="current-password"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby="login-password-error"
                  />
                  <button
                    type="button"
                    className="icon-btn trail"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-controls="login-password"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    data-tip={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="i" aria-hidden="true" /> : <Eye className="i" aria-hidden="true" />}
                  </button>
                </div>
                <p className="field-error m-0" id="login-password-error" aria-live="polite">{passwordError}</p>
                {needTotp && !passwordError && (
                  <span className="ok-note">
                    <Check className="i" aria-hidden="true" />
                    Password accepted
                  </span>
                )}
              </div>

              {/* 2FA Step */}
              {needTotp && (
                <div className={`field animate-in fade-in${codeError ? ' invalid' : ''}`}>
                  <label className="field-label" htmlFor="login-code">
                    {useRecovery ? 'Recovery code' : 'Authenticator code'}
                  </label>
                  <div className="control">
                    <KeyRound className="i lead" aria-hidden="true" />
                    <input
                      ref={codeRef}
                      id="login-code"
                      name="code"
                      type="text"
                      value={totpCode}
                      onChange={(e) => {
                        setTotpCode(e.target.value);
                        if (fieldErrors.code && e.target.value.trim()) setFieldErrors((f) => ({ ...f, code: undefined }));
                        if (error) setError(null);
                      }}
                      placeholder={useRecovery ? 'xxxx-xxxx' : '123456'}
                      maxLength={useRecovery ? 12 : 6}
                      autoFocus
                      autoComplete="one-time-code"
                      inputMode={useRecovery ? 'text' : 'numeric'}
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-invalid={codeError ? true : undefined}
                      aria-describedby="login-code-error"
                      className="font-mono tabular body-large "
                    />
                  </div>
                  <p className="field-error m-0" id="login-code-error" aria-live="polite">{codeError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setUseRecovery(!useRecovery);
                      setTotpCode('');
                      setFieldErrors((f) => ({ ...f, code: undefined }));
                    }}
                    className="btn text xs -ml-3.5 self-start"
                  >
                    {useRecovery ? 'Use 6-digit authenticator code' : 'Use a one-time recovery code instead'}
                  </button>
                </div>
              )}

              <label className="check-row select-none">
                <span className="cb-target">
                  <input
                  type="checkbox"
                  className="cb"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                </span>
                <span>Remember me for 30 days</span>
              </label>
            </div>

            <button
              type="submit"
              className={`btn filled m block${loading ? ' is-busy' : ''}`}
              aria-disabled={loading ? true : undefined}
            >
              <span className="loading" aria-hidden="true" />
              <span>{loading ? 'Signing in…' : needTotp ? 'Verify and sign in' : 'Sign in'}</span>
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
