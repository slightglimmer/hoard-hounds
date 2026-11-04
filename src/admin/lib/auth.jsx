import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { MODE, supabase } from './supabase.js';

// Works out which screen the person should see:
//   loading -> signed_out -> (forbidden | mfa_enroll | mfa_verify) -> set_password? -> ready
// This only decides what to show. The real protection is in the database, which
// refuses admin data unless the login token says admin + two-step (aal2).

const AuthContext = createContext(null);
const RESET_FLAG = 'hh-admin-password-reset';

function readResetFlag() {
  try {
    return sessionStorage.getItem(RESET_FLAG) === '1';
  } catch {
    return false;
  }
}

function writeResetFlag(on) {
  try {
    if (on) sessionStorage.setItem(RESET_FLAG, '1');
    else sessionStorage.removeItem(RESET_FLAG);
  } catch {
    // Private browsing: the reset screen just won't survive a reload.
  }
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(() =>
    MODE === 'live' ? { stage: 'loading' } : { stage: 'ready', user: { email: 'demo@example.com' }, demo: true },
  );

  const evaluate = useCallback(async (session) => {
    if (!session) {
      setState({ stage: 'signed_out' });
      return;
    }
    const user = session.user;
    try {
      const { data: roleRow, error } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (roleRow?.role !== 'admin') {
        setState({ stage: 'forbidden', user, role: roleRow?.role ?? null });
        return;
      }
      const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) throw aalError;
      if (aal.currentLevel !== 'aal2') {
        setState({ stage: aal.nextLevel === 'aal2' ? 'mfa_verify' : 'mfa_enroll', user });
        return;
      }
      setState({ stage: readResetFlag() ? 'set_password' : 'ready', user });
    } catch (error) {
      setState({ stage: 'error', user, error });
    }
  }, []);

  useEffect(() => {
    if (MODE !== 'live') return undefined;
    // Arrived from a "reset password" email link.
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === '1') {
      writeResetFlag(true);
      params.delete('reset');
      const query = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
    }
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') writeResetFlag(true);
      // Supabase asks that other auth calls not run inside this callback directly.
      setTimeout(() => evaluate(session), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [evaluate]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await evaluate(data.session);
  }, [evaluate]);

  const signOut = useCallback(async () => {
    writeResetFlag(false);
    if (supabase) await supabase.auth.signOut();
    else setState({ stage: 'ready', user: { email: 'demo@example.com' }, demo: true });
  }, []);

  const finishPasswordReset = useCallback(() => {
    writeResetFlag(false);
    setState((s) => ({ ...s, stage: 'ready' }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, refresh, signOut, finishPasswordReset }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// Supabase error messages, in plain words.
export function authErrorMessage(error) {
  const msg = error?.message || '';
  if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match. Please try again.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email address first, using the link Supabase sent you.';
  if (/invalid totp|invalid.*code|expired/i.test(msg)) return 'That code didn’t work. Codes change every 30 seconds, so try the newest one.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  if (/failed to fetch|network/i.test(msg)) return 'Can’t reach the server. Check your internet connection.';
  return msg || 'Something went wrong. Please try again.';
}
