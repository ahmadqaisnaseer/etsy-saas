import { useEffect, useState, type FormEvent } from 'react';
import { api, type Session } from './api.js';
import './styles.css';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void api
      .session()
      .then(setSession)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const field = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    try {
      const email = field('email');
      const password = field('password');
      const next = registering
        ? await api.register({
            email,
            password,
            displayName: field('displayName'),
            organizationName: field('organizationName'),
          })
        : await api.login(email, password);
      setSession(next);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message.replaceAll('_', ' ').toLowerCase()
          : 'Request failed',
      );
    }
  }

  if (loading)
    return (
      <main className="center">
        <p>Loading workspace…</p>
      </main>
    );

  if (session) {
    return (
      <main className="shell">
        <header>
          <div>
            <span className="eyebrow">Merchant Workspace</span>
            <h1>Welcome, {session.user.displayName}</h1>
          </div>
          <button
            className="secondary"
            onClick={() => void api.logout().then(() => setSession(null))}
          >
            Sign out
          </button>
        </header>
        <section className="panel">
          <h2>Your organizations</h2>
          <div className="tenant-grid">
            {session.tenants.map((tenant) => (
              <article key={tenant.id}>
                <span className="status">Active</span>
                <h3>{tenant.name}</h3>
                <p>{tenant.role}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="notice">
          <strong>Etsy connections are disabled.</strong>
          <span>This foundation will not access or modify any Etsy store.</span>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-layout">
      <section className="intro">
        <span className="eyebrow">Secure commerce operations</span>
        <h1>One calm place for every shop team.</h1>
        <p>
          A tenant-isolated foundation for the workflows you will build next. Etsy access is not
          enabled.
        </p>
      </section>
      <section className="card">
        <h2>{registering ? 'Create your workspace' : 'Sign in'}</h2>
        <form onSubmit={(event) => void submit(event)}>
          {registering && (
            <>
              <label>
                Name
                <input name="displayName" autoComplete="name" required />
              </label>
              <label>
                Organization
                <input name="organizationName" required />
              </label>
            </>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={registering ? 'new-password' : 'current-password'}
              minLength={12}
              required
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit">{registering ? 'Create workspace' : 'Sign in'}</button>
        </form>
        <button
          className="link"
          onClick={() => {
            setRegistering(!registering);
            setError('');
          }}
        >
          {registering ? 'Already have an account? Sign in' : 'New here? Create a workspace'}
        </button>
      </section>
    </main>
  );
}
