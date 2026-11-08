import React, { useRef, useState } from 'react';
import { Eye, EyeOff, User, Lock } from 'lucide-react';
import { api, humanizeError, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Brand } from '../ui/BrandMark';

type FieldErrors = { username?: string; password?: string; confirm?: string };

export function SetupView() {
  const { login } = useAuth();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const busyRef = useRef(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyRef.current) return;
    setError(null);

    const u = username.trim();
    const nextErrors: FieldErrors = {};
    if (u.length < 3) nextErrors.username = 'Username must be at least 3 characters.';
    if (password.length < 8) nextErrors.password = 'Password must be at least 8 characters.';
    if (password !== confirmPassword) nextErrors.confirm = 'Passwords do not match.';
    setFieldErrors(nextErrors);
    if (nextErrors.username) { usernameRef.current?.focus(); return; }
    if (nextErrors.password) { passwordRef.current?.focus(); return; }
    if (nextErrors.confirm) { confirmRef.current?.focus(); return; }

    busyRef.current = true;
    setLoading(true);
    try {
      const session = await api.setup({ username: u, password });
      toast.success('Account created successfully');
      login(session);
    } catch (err: any) {
      setError(err instanceof ApiError ? humanizeError(err.code) : 'Setup failed');
      passwordRef.current?.focus();
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  const passwordError = fieldErrors.password || error || '';
  const revealLabel = showPassword ? 'Hide password' : 'Show password';

  return (
    <div className="flex min-h-dvh flex-col bg-surface text-on-surface safe-pt safe-pb safe-pl safe-pr">
      <main className="flex flex-1 flex-col items-center justify-center gap-5 px-4 pb-16 pt-10 sm:pb-24">
        <div className="form-card">
          <div className="form-card-head">
            <Brand className="mb-6 justify-center" />
            <h1 className="form-card-title">Create your account</h1>
            <p className="form-card-sub">This is a private single-owner app. Set up the one account that can sign in.</p>
          </div>
          <form method="post" noValidate onSubmit={handleSubmit} aria-busy={loading}>

            <div className="fields">
              <div className={`field${fieldErrors.username ? ' invalid' : ''}`}>
                <label className="field-label" htmlFor="setup-username">Username</label>
                <div className="control">
                  <User className="i lead" aria-hidden="true" />
                  <input
                    ref={usernameRef}
                    id="setup-username"
                    name="username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (fieldErrors.username && e.target.value.trim().length >= 3) setFieldErrors((f) => ({ ...f, username: undefined }));
                    }}
                    placeholder="Choose a username"
                    required
                    minLength={3}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={fieldErrors.username ? true : undefined}
                    aria-describedby="setup-username-error"
                  />
                </div>
                <p className="field-error m-0" id="setup-username-error" aria-live="polite">{fieldErrors.username || ''}</p>
              </div>

              <div className={`field${passwordError ? ' invalid' : ''}`}>
                <label className="field-label" htmlFor="setup-password">Password</label>
                <div className="control has-trail">
                  <Lock className="i lead" aria-hidden="true" />
                  <input
                    ref={passwordRef}
                    id="setup-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      const next = e.target.value;
                      setPassword(next);
                      if (error) setError(null);
                      setFieldErrors((f) => ({
                        ...f,
                        password: f.password && next.length >= 8 ? undefined : f.password,
                        confirm: f.confirm && next === confirmPassword ? undefined : f.confirm,
                      }));
                    }}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby="setup-password-error"
                  />
                  <button
                    type="button"
                    className="icon-btn trail"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-controls="setup-password setup-confirm"
                    aria-label={revealLabel}
                    data-tip={revealLabel}
                  >
                    {showPassword ? <EyeOff className="i" aria-hidden="true" /> : <Eye className="i" aria-hidden="true" />}
                  </button>
                </div>
                <p className="field-error m-0" id="setup-password-error" aria-live="polite">{passwordError}</p>
              </div>

              <div className={`field${fieldErrors.confirm ? ' invalid' : ''}`}>
                <label className="field-label" htmlFor="setup-confirm">Confirm password</label>
                <div className="control">
                  <Lock className="i lead" aria-hidden="true" />
                  <input
                    ref={confirmRef}
                    id="setup-confirm"
                    name="confirm"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (fieldErrors.confirm && e.target.value === password) setFieldErrors((f) => ({ ...f, confirm: undefined }));
                    }}
                    placeholder="Repeat your password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    aria-invalid={fieldErrors.confirm ? true : undefined}
                    aria-describedby="setup-confirm-error"
                  />
                </div>
                <p className="field-error m-0" id="setup-confirm-error" aria-live="polite">{fieldErrors.confirm || ''}</p>
              </div>
            </div>

            <button
              type="submit"
              className={`btn filled m block${loading ? ' is-busy' : ''}`}
              aria-disabled={loading ? true : undefined}
            >
              <span className="loading" aria-hidden="true" />
              <span>{loading ? 'Creating account…' : 'Create account'}</span>
            </button>
          </form>
        </div>

        <p className="max-w-[440px] px-4 text-center body-small text-on-surface-variant">
          Keep these credentials safe — this is the only account that can sign in.
        </p>
      </main>
    </div>
  );
}
