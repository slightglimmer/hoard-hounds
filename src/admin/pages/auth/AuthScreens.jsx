import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '../../../components/Logo.jsx';
import AdminIcon from '../../components/AdminIcon.jsx';
import { Field, Spinner } from '../../components/ui.jsx';
import { authErrorMessage, useAuth } from '../../lib/auth.jsx';
import { supabase } from '../../lib/supabase.js';

function AuthShell({ title, subtitle, children, icon = 'shield' }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-rise">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-white shadow-soft">
            <LogoMark className="h-11 w-11" />
          </span>
          <p className="mt-4 text-xs font-bold tracking-[0.2em] text-rose-deep uppercase">Hoard Hounds · Business Studio</p>
        </div>
        <section className="card p-7 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush text-rose-deep">
              <AdminIcon name={icon} />
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            </div>
          </div>
          <div className="mt-6">{children}</div>
        </section>
        <p className="mt-6 text-center text-sm text-muted">
          <a href="/" className="font-semibold text-rose-deep underline-offset-4 hover:underline">
            ← Back to hoardhounds.com
          </a>
        </p>
      </div>
    </main>
  );
}

function FormError({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 flex items-start gap-2 rounded-2xl bg-danger/8 px-4 py-3 text-sm font-medium text-danger">
      <AdminIcon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </p>
  );
}

// Six-digit authenticator code box.
function CodeInput({ value, onChange, props }) {
  return (
    <input
      {...props}
      className="input text-center font-display text-2xl tracking-[0.5em] tabular"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      placeholder="••••••"
      autoFocus
    />
  );
}

// ---------------------------------------------------------------------------

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('signin'); // signin | forgot | sent

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(authErrorMessage(err));
    // On success the auth listener moves on to the two-step screen.
  }

  async function sendReset(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/?reset=1`,
    });
    setBusy(false);
    // Same message whether or not the account exists, so the form can't be used to look up emails.
    if (err && !/user|not found/i.test(err.message)) setError(authErrorMessage(err));
    else setMode('sent');
  }

  if (mode === 'sent') {
    return (
      <AuthShell title="Check your email" subtitle="If that address has an admin account, a reset link is on its way." icon="check">
        <p className="text-sm text-muted">Open the link on this device. It expires after a short time.</p>
        <button type="button" className="btn-soft mt-6 w-full" onClick={() => setMode('signin')}>
          Back to sign in
        </button>
      </AuthShell>
    );
  }

  const forgot = mode === 'forgot';
  return (
    <AuthShell
      title={forgot ? 'Reset your password' : 'Welcome back'}
      subtitle={forgot ? 'We’ll email you a link to choose a new password.' : 'Sign in to manage your business.'}
      icon={forgot ? 'key' : 'shield'}
    >
      <FormError message={error} />
      <form onSubmit={forgot ? sendReset : submit} className="space-y-4" noValidate>
        <Field label="Email">
          {(p) => <input {...p} type="email" autoComplete="username" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        {!forgot && (
          <Field label="Password">
            {(p) => (
              <input {...p} type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
          </Field>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy || !email || (!forgot && !password)}>
          {busy ? 'Please wait…' : forgot ? 'Send reset link' : 'Sign in'}
        </button>
      </form>
      <button
        type="button"
        className="mt-4 w-full text-center text-sm font-semibold text-rose-deep underline-offset-4 hover:underline"
        onClick={() => {
          setError('');
          setMode(forgot ? 'signin' : 'forgot');
        }}
      >
        {forgot ? 'Back to sign in' : 'Forgot your password?'}
      </button>
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------

export function MfaEnroll() {
  const { refresh, signOut } = useAuth();
  const [factor, setFactor] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Guard against React's development double-run creating two factors.
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        // Clear out any half-finished setup from an earlier visit.
        const { data: list } = await supabase.auth.mfa.listFactors();
        for (const f of list?.all ?? []) {
          if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const { data, error: err } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: `Authenticator app ${new Date().toISOString().slice(0, 10)}`,
        });
        if (err) throw err;
        const qr = data.totp.qr_code;
        setFactor({ id: data.id, secret: data.totp.secret, qr: qr.startsWith('data:') ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}` });
      } catch (err) {
        setError(authErrorMessage(err));
      }
    })();
  }, []);

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (err) {
      setError(authErrorMessage(err));
      setCode('');
    } else {
      await refresh();
    }
  }

  return (
    <AuthShell title="Set up two-step login" subtitle="Your business records need more than a password. This takes about a minute.">
      <ol className="space-y-2 text-sm text-muted">
        <li>
          <strong className="text-ink">1.</strong> Install an authenticator app, such as Google Authenticator, Microsoft Authenticator,
          1Password or Authy.
        </li>
        <li>
          <strong className="text-ink">2.</strong> In the app, add an account and scan this code.
        </li>
        <li>
          <strong className="text-ink">3.</strong> Type the 6-digit code it shows.
        </li>
      </ol>
      <div className="my-6 flex justify-center">
        {factor ? (
          <img src={factor.qr} alt="QR code for your authenticator app" width="184" height="184" className="rounded-2xl bg-white p-2 shadow-soft ring-1 ring-line" />
        ) : (
          !error && <Spinner label="Preparing your code" />
        )}
      </div>
      {factor && (
        <details className="mb-5 rounded-2xl bg-blush/60 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-rose-ink">Can’t scan? Enter this key instead</summary>
          <code className="mt-2 block font-mono text-base break-all text-ink select-all">{factor.secret}</code>
        </details>
      )}
      <FormError message={error} />
      {factor && (
        <form onSubmit={verify} className="space-y-4">
          <Field label="6-digit code">{(p) => <CodeInput value={code} onChange={setCode} props={p} />}</Field>
          <button type="submit" className="btn-primary w-full" disabled={busy || code.length !== 6}>
            {busy ? 'Checking…' : 'Turn on two-step login'}
          </button>
        </form>
      )}
      <button type="button" className="mt-4 w-full text-center text-sm font-semibold text-muted hover:text-ink" onClick={signOut}>
        Sign out
      </button>
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------

export function MfaVerify() {
  const { refresh, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) throw listErr;
      const factor = data.totp.find((f) => f.status === 'verified');
      if (!factor) throw new Error('No authenticator is set up for this account.');
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (err) throw err;
      await refresh();
    } catch (err) {
      setError(authErrorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Enter your code" subtitle="Open your authenticator app and type the 6-digit code for Hoard Hounds.">
      <FormError message={error} />
      <form onSubmit={verify} className="space-y-4">
        <Field label="6-digit code">{(p) => <CodeInput value={code} onChange={setCode} props={p} />}</Field>
        <button type="submit" className="btn-primary w-full" disabled={busy || code.length !== 6}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Lost your phone? An admin can reset two-step login from the Supabase dashboard (see docs/ADMIN_SETUP.md).
      </p>
      <button type="button" className="mt-3 w-full text-center text-sm font-semibold text-muted hover:text-ink" onClick={signOut}>
        Sign out
      </button>
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------

export function SetNewPassword() {
  const { finishPasswordReset } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const tooShort = password.length > 0 && password.length < 12;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e) {
    e.preventDefault();
    if (password.length < 12 || password !== confirm) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(authErrorMessage(err));
    else finishPasswordReset();
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 12 characters. A short phrase is easier to remember." icon="key">
      <FormError message={error} />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="New password" error={tooShort ? 'Use at least 12 characters.' : ''}>
          {(p) => <input {...p} type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Confirm new password" error={mismatch ? 'The passwords don’t match.' : ''}>
          {(p) => <input {...p} type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={busy || password.length < 12 || password !== confirm}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------

export function Forbidden() {
  const { user, role, signOut } = useAuth();
  return (
    <AuthShell
      title="This area is for admins"
      subtitle={`You’re signed in as ${user?.email}${role === 'employee' ? ', which has an employee login.' : ', which doesn’t have admin access.'}`}
      icon="alert"
    >
      <p className="text-sm text-muted">
        {role === 'employee'
          ? 'The employee portal is coming soon. Ask the business owner if you need something in the meantime.'
          : 'If you’re the owner, follow “Make yourself an admin” in docs/ADMIN_SETUP.md, then sign in again.'}
      </p>
      <button type="button" className="btn-soft mt-6 w-full" onClick={signOut}>
        Sign out
      </button>
    </AuthShell>
  );
}

export function AuthError() {
  const { error, refresh, signOut } = useAuth();
  return (
    <AuthShell title="We couldn’t check your access" subtitle={authErrorMessage(error)} icon="alert">
      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" onClick={refresh}>
          Try again
        </button>
        <button type="button" className="btn-ghost flex-1" onClick={signOut}>
          Sign out
        </button>
      </div>
    </AuthShell>
  );
}

export function NotConfigured() {
  return (
    <AuthShell title="Admin isn’t connected yet" subtitle="This site hasn’t been linked to its Supabase database." icon="info">
      <p className="text-sm text-muted">
        Follow docs/ADMIN_SETUP.md to create the database and add the <code className="font-mono text-ink">VITE_SUPABASE_URL</code> and{' '}
        <code className="font-mono text-ink">VITE_SUPABASE_PUBLISHABLE_KEY</code> settings, then redeploy.
      </p>
    </AuthShell>
  );
}

export function UnsafeKey() {
  return (
    <AuthShell title="Stopped for safety" subtitle="This site was built with a secret Supabase key." icon="alert">
      <p className="text-sm text-muted">
        Secret and service_role keys bypass every security rule and must never be in a website. In Supabase, rotate that key
        now, then set <code className="font-mono text-ink">VITE_SUPABASE_PUBLISHABLE_KEY</code> to the <strong>publishable</strong> key
        and redeploy.
      </p>
    </AuthShell>
  );
}

export function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <Spinner label="Opening your dashboard" />
    </main>
  );
}
