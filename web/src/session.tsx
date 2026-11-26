// Session state shared by the whole application.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setCsrf } from './api';

export type User = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'staff' | 'client';
  client_id: number | null;
  client_name?: string | null;
};

export type Session = {
  user: User | null;
  csrf: string;
  setup_needed: boolean;
  settings: { business_name: string; currency: string; portal_welcome: string };
  nav: Record<string, number>;
};

type SessionContextValue = {
  session: Session | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  loading: true,
  error: null,
  refresh: async () => {},
  logout: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<Session>('/app/api/session');
      setCsrf(data.csrf ?? '');
      setSession(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('/app/api/session', { method: 'DELETE' });
    await refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ session, loading, error, refresh, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
