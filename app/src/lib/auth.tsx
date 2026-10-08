import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from './supabase';
import { PROFILE_COLUMNS, type AccountState, type Profile } from './types';

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Account standing from the server (a shadowban reads as active). */
  account: AccountState | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [initialised, setInitialised] = useState(false);
  // The user id the current `profile` value was loaded for, so a fresh sign-in
  // shows a spinner rather than flashing onboarding before the profile arrives.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setAccount(null);
      setLoadedFor(null);
      return;
    }
    const [{ data }, { data: state }] = await Promise.all([
      supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle(),
      supabase.rpc('my_account_state'),
    ]);
    setProfile((data as Profile | null) ?? null);
    setAccount((state as AccountState | null) ?? null);
    setLoadedFor(userId);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (mounted) setInitialised(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Defer the query: supabase-js warns against awaiting inside this callback.
      setTimeout(() => loadProfile(next?.user.id), 0);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const loading = !initialised || (!!session && loadedFor !== session.user.id);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      account,
      refreshProfile: () => loadProfile(session?.user.id),
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
      },
    }),
    [loading, session, profile, account, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in user's id. Only use on screens behind the auth guard. */
export function useUserId(): string {
  const { session } = useAuth();
  if (!session) throw new Error('useUserId called while signed out');
  return session.user.id;
}
