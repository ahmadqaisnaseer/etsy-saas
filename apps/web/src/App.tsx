import { useEffect, useState, type FormEvent } from 'react';
import { api, type Profile, type SafeSession, type Session } from './api.js';
import './styles.css';
type View = 'login' | 'register' | 'forgot' | 'reset' | 'verify' | 'account' | 'security';
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>(() =>
    location.pathname.includes('reset-password')
      ? 'reset'
      : location.pathname.includes('verify-email')
        ? 'verify'
        : 'login',
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<SafeSession[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    void api
      .session()
      .then((s) => {
        setSession(s);
        setView('account');
      })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    if (session && view === 'account') void api.profile().then(setProfile);
    if (session && view === 'security') void api.sessions().then(setSessions);
  }, [session, view]);
  const field = (f: FormData, n: string) => {
    const value = f.get(n);
    return typeof value === 'string' ? value : '';
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage('');
    const f = new FormData(e.currentTarget);
    try {
      if (view === 'login') setSession(await api.login(field(f, 'email'), field(f, 'password')));
      if (view === 'register')
        setSession(
          await api.register({
            firstName: field(f, 'firstName'),
            lastName: field(f, 'lastName'),
            email: field(f, 'email'),
            password: field(f, 'password'),
            passwordConfirmation: field(f, 'passwordConfirmation'),
            acceptedTerms: f.get('terms') === 'on',
            acceptedPrivacy: f.get('privacy') === 'on',
          }),
        );
      if (view === 'forgot') {
        await api.forgot(field(f, 'email'));
        setMessage('If that account exists, a reset email has been recorded.');
      }
      if (view === 'reset') {
        await api.reset(
          new URLSearchParams(location.search).get('token') ?? '',
          field(f, 'password'),
          field(f, 'passwordConfirmation'),
        );
        setView('login');
        setMessage('Password reset. Sign in with your new password.');
      }
      if (view === 'verify') {
        await api.verify(new URLSearchParams(location.search).get('token') ?? '');
        setMessage('Email verified.');
        if (session)
          setSession({
            ...session,
            user: { ...session.user, emailVerified: true },
          });
      }
      if (view === 'account') {
        await api.updateProfile({
          firstName: field(f, 'firstName'),
          lastName: field(f, 'lastName'),
        });
        setProfile(await api.profile());
        setMessage('Profile updated.');
      }
      if (view === 'security' && field(f, 'currentPassword')) {
        await api.changePassword({
          currentPassword: field(f, 'currentPassword'),
          password: field(f, 'password'),
          passwordConfirmation: field(f, 'passwordConfirmation'),
        });
        setMessage('Password changed; other sessions were revoked.');
      }
    } catch (x) {
      setMessage(x instanceof Error ? x.message.replaceAll('_', ' ') : 'Request failed');
    }
  }
  if (busy) return <main className="center">Restoring your session…</main>;
  if (session)
    return (
      <main className="shell">
        <header>
          <div>
            <span className="eyebrow">Account workspace</span>
            <h1>{session.user.displayName}</h1>
          </div>
          <button
            onClick={() =>
              void api.logout().then(() => {
                setSession(null);
                setView('login');
              })
            }
          >
            Sign out
          </button>
        </header>
        {!session.user.emailVerified && (
          <section className="notice">
            <strong>Verify your email to unlock protected SaaS activity.</strong>
            <button
              className="link"
              onClick={() =>
                void api.resend().then(() => setMessage('Verification email recorded.'))
              }
            >
              Resend
            </button>
          </section>
        )}
        <nav>
          <button className="secondary" onClick={() => setView('account')}>
            Profile
          </button>
          <button className="secondary" onClick={() => setView('security')}>
            Security & sessions
          </button>
        </nav>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        {view === 'account' && profile && (
          <section className="panel">
            <h2>Profile</h2>
            <p>
              <strong>Email:</strong> {profile.email} (read-only)
            </p>
            <p>
              <strong>Workspace:</strong> {profile.organization.name} · {profile.organization.role}
            </p>
            <p>
              <strong>Member since:</strong> {new Date(profile.createdAt).toLocaleDateString()}
            </p>
            <form onSubmit={(e) => void submit(e)}>
              <label>
                First name
                <input name="firstName" defaultValue={profile.firstName} required />
              </label>
              <label>
                Last name
                <input name="lastName" defaultValue={profile.lastName} required />
              </label>
              <button>Save profile</button>
            </form>
          </section>
        )}
        {view === 'security' && (
          <section className="panel">
            <h2>Change password</h2>
            <form onSubmit={(e) => void submit(e)}>
              <label>
                Current password
                <input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label>
                Confirm new password
                <input name="passwordConfirmation" type="password" minLength={12} required />
              </label>
              <button>Change password</button>
            </form>
            <h2>Active sessions</h2>
            {sessions.map((s) => (
              <article key={s.id}>
                <strong>{s.current ? 'Current session' : 'Other session'}</strong>
                <p>
                  {s.userAgent ?? 'Unknown device'} · last active{' '}
                  {new Date(s.lastActivityAt).toLocaleString()}
                </p>
                {!s.current && (
                  <button
                    onClick={() =>
                      void api
                        .revoke(s.id)
                        .then(() => setSessions((v) => v.filter((x) => x.id !== s.id)))
                    }
                  >
                    Revoke
                  </button>
                )}
              </article>
            ))}
            <button
              onClick={() =>
                void api.revokeOthers().then(() => setSessions((v) => v.filter((s) => s.current)))
              }
            >
              Sign out all other sessions
            </button>
          </section>
        )}
      </main>
    );
  return (
    <main className="auth-layout">
      <section className="intro">
        <span className="eyebrow">Secure account access</span>
        <h1>Build safely from identity outward.</h1>
        <p>Etsy access is not enabled. Billing also remains disabled.</p>
      </section>
      <section className="card">
        <h2>
          {
            {
              login: 'Sign in',
              register: 'Create account',
              forgot: 'Forgot password',
              reset: 'Reset password',
              verify: 'Verify email',
              account: 'Account',
              security: 'Security',
            }[view]
          }
        </h2>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        <form onSubmit={(e) => void submit(e)}>
          {view === 'register' && (
            <>
              <label>
                First name
                <input name="firstName" autoComplete="given-name" required />
              </label>
              <label>
                Last name
                <input name="lastName" autoComplete="family-name" required />
              </label>
            </>
          )}
          {['login', 'register', 'forgot'].includes(view) && (
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
          )}
          {['login', 'register', 'reset'].includes(view) && (
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={12}
                autoComplete={view === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </label>
          )}
          {['register', 'reset'].includes(view) && (
            <label>
              Confirm password
              <input name="passwordConfirmation" type="password" minLength={12} required />
            </label>
          )}
          {view === 'register' && (
            <>
              <label className="check">
                <input name="terms" type="checkbox" required />I accept the Terms of Service
              </label>
              <label className="check">
                <input name="privacy" type="checkbox" required />I accept the Privacy Policy
              </label>
            </>
          )}
          <button disabled={busy}>{view === 'verify' ? 'Verify email' : 'Continue'}</button>
        </form>
        <div className="actions">
          <button
            className="link"
            onClick={() => setView(view === 'register' ? 'login' : 'register')}
          >
            {view === 'register' ? 'Sign in' : 'Create account'}
          </button>
          <button className="link" onClick={() => setView('forgot')}>
            Forgot password?
          </button>
        </div>
      </section>
    </main>
  );
}
