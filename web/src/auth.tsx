import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getToken, setToken } from '@/api/client';
import { setBusinessDayMinutes } from '@/businessCalendar';
import { fetchBusinessCalendar, fetchMe } from '@/api/operations';
import type { User } from '@/api/types';

interface AuthValue {
  viewer: User | null;
  loading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [viewer, setViewer] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (getToken() === null) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then((user) => {
        if (user === null) setToken(null);
        setViewer(user);
        if (user !== null) {
          void fetchBusinessCalendar()
            .then(({ startHour, endHour }) => setBusinessDayMinutes((endHour - startHour) * 60))
            .catch(() => undefined);
        }
      })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      viewer,
      loading,
      signIn: (token, user) => {
        setToken(token);
        setViewer(user);
        void fetchBusinessCalendar()
          .then(({ startHour, endHour }) => setBusinessDayMinutes((endHour - startHour) * 60))
          .catch(() => undefined);
      },
      signOut: () => {
        setToken(null);
        setViewer(null);
      },
    }),
    [viewer, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth must be used inside an AuthProvider');
  return value;
}
