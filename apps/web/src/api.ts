import type { SessionUser, TenantSummary } from '@etsy-saas/shared';

export type Session = { sessionId: string; user: SessionUser; tenants: TenantSummary[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  session: () => request<Session>('/auth/session'),
  login: (email: string, password: string) =>
    request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (input: {
    email: string;
    password: string;
    displayName: string;
    organizationName: string;
  }) => request<Session>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request<void>('/auth/session', { method: 'DELETE' }),
};
