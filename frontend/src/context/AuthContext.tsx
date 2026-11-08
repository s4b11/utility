import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setCsrfToken, setSessionToken } from '../lib/api';
import type { AuthSession } from '../types';

interface AuthContextType {
  session: AuthSession | null;
  needsSetup: boolean;
  loading: boolean;
  totpEnabled: boolean;
  login: (session: AuthSession) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setTotpStatus: (enabled: boolean) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totpEnabled, setTotpEnabled] = useState(false);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      const status = await api.setupStatus();
      if (status.needs_setup) {
        setNeedsSetup(true);
        setSession(null);
        setLoading(false);
        return;
      }
      setNeedsSetup(false);

      const me = await api.me();
      setSession(me);
      setCsrfToken(me.csrf_token);
      setTotpEnabled(!!me.totp_enabled);
    } catch {
      setSession(null);
      setCsrfToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    const handleExpired = () => {
      setSession(null);
      setCsrfToken(null);
      setSessionToken(null);
    };

    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, [checkAuth]);

  const login = (newSession: AuthSession) => {
    setSession(newSession);
    setCsrfToken(newSession.csrf_token);
    if (newSession.token) {
      setSessionToken(newSession.token);
    }
    setTotpEnabled(!!newSession.totp_enabled);
    setNeedsSetup(false);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {}
    setSession(null);
    setCsrfToken(null);
    setSessionToken(null);
  };

  const setTotpStatus = (enabled: boolean) => {
    setTotpEnabled(enabled);
    if (session) {
      setSession({ ...session, totp_enabled: enabled });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        needsSetup,
        loading,
        totpEnabled,
        login,
        logout,
        checkAuth,
        setTotpStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
