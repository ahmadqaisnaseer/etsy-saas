import type { SessionUser, TenantSummary } from '@etsy-saas/shared';
export type Session = {
  sessionId: string;
  user: SessionUser;
  tenants: TenantSummary[];
};
export type Profile = {
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  organization: { id: string; name: string; role: string };
};
export type SafeSession = {
  id: string;
  current: boolean;
  createdAt: string;
  lastActivityAt: string;
  userAgent: string | null;
};
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const api = {
  session: () => request<Session>('/auth/session'),
  login: (email: string, password: string) => post<Session>('/auth/login', { email, password }),
  register: (body: unknown) => post<Session>('/auth/register', body),
  logout: () => post<void>('/auth/logout', {}),
  verify: (token: string) => post<{ verified: boolean }>('/auth/verify-email', { token }),
  resend: () => post('/auth/resend-verification', {}),
  forgot: (email: string) => post('/auth/forgot-password', { email }),
  reset: (token: string, password: string, passwordConfirmation: string) =>
    post('/auth/reset-password', { token, password, passwordConfirmation }),
  profile: () => request<Profile>('/account/profile'),
  updateProfile: (body: unknown) =>
    request<void>('/account/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  changePassword: (body: unknown) => post<void>('/account/change-password', body),
  sessions: () => request<SafeSession[]>('/account/sessions'),
  revoke: (id: string) => request<void>(`/account/sessions/${id}`, { method: 'DELETE' }),
  revokeOthers: () => post<{ revoked: number }>('/account/sessions/revoke-others', {}),
};
