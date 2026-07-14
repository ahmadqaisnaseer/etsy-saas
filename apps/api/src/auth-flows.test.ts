/* eslint-disable @typescript-eslint/unbound-method */
import type { Environment } from '@etsy-saas/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { hashPassword } from './security.js';
import type { AuthRepository, EmailProvider } from './types.js';

const env: Environment = {
  APP_ENV: 'test',
  LOG_LEVEL: 'fatal',
  WEB_ORIGIN: 'http://localhost:5173',
  API_PORT: 3000,
  DATABASE_URL: 'postgresql://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'session',
  SESSION_TTL_HOURS: 1,
  VERIFICATION_TOKEN_TTL_MINUTES: 60,
  PASSWORD_RESET_TOKEN_TTL_MINUTES: 30,
  APP_BASE_URL: 'http://localhost:5173',
  EMAIL_FROM_NAME: 'Test',
  EMAIL_FROM_ADDRESS: 'noreply@example.test',
  PASSWORD_PEPPER: 'a-secure-test-pepper-that-is-long-enough',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY: 'test',
  S3_SECRET_KEY: 'test',
  S3_FORCE_PATH_STYLE: true,
  ETSY_INTEGRATION_ENABLED: false,
};
const authenticated = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  user: {
    id: 'user-id',
    email: 'owner@example.com',
    displayName: 'Owner User',
    emailVerified: false,
  },
  tenants: [
    { id: 'tenant-id', name: 'Owner Workspace', slug: 'owner-workspace', role: 'owner' as const },
  ],
};
const readiness = { database: vi.fn(), redis: vi.fn(), storage: vi.fn() };

function repository(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    register: vi.fn().mockResolvedValue({ ...authenticated, sessionId: '' }),
    findUserForLogin: vi.fn().mockResolvedValue(null),
    createSession: vi.fn().mockResolvedValue(authenticated),
    getSession: vi.fn().mockResolvedValue(null),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    issueToken: vi.fn().mockResolvedValue(undefined),
    consumeToken: vi.fn().mockResolvedValue(null),
    markEmailVerified: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    listSessions: vi.fn().mockResolvedValue([]),
    revokeSession: vi.fn().mockResolvedValue(false),
    revokeOtherSessions: vi.fn().mockResolvedValue(0),
    audit: vi.fn(),
    ...overrides,
  };
}

describe('authentication and account flows', () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));
  const make = async (auth: AuthRepository, email?: EmailProvider) => {
    const app = await buildApp({ env, auth, email, readiness, logger: false });
    apps.push(app);
    return app;
  };

  it('rejects weak registration passwords and missing policy acceptance', async () => {
    const auth = repository();
    const app = await make(auth);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        firstName: 'A',
        lastName: 'B',
        email: 'owner@example.com',
        password: 'password1234',
        passwordConfirmation: 'password1234',
        acceptedTerms: false,
        acceptedPrivacy: false,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('registers, hashes the password, creates a session, and sends verification mail', async () => {
    const auth = repository();
    const email = { send: vi.fn().mockResolvedValue(undefined) };
    const app = await make(auth, email);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: ' ADA@EXAMPLE.COM ',
        password: 'correct horse battery staple',
        passwordConfirmation: 'correct horse battery staple',
        acceptedTerms: true,
        acceptedPrivacy: true,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(auth.register).toHaveBeenCalledOnce();
    expect((auth.register as ReturnType<typeof vi.fn>).mock.calls[0]![1]).not.toContain(
      'correct horse',
    );
    expect(auth.issueToken).toHaveBeenCalledWith(
      'verification',
      'user-id',
      expect.any(Buffer),
      expect.any(Date),
    );
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.com' }));
  });

  it('returns the same generic login failure for missing and incorrect accounts', async () => {
    const passwordHash = await hashPassword('a different valid password', env.PASSWORD_PEPPER);
    for (const found of [null, { id: 'user-id', passwordHash }]) {
      const app = await make(repository({ findUserForLogin: vi.fn().mockResolvedValue(found) }));
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'owner@example.com', password: 'correct horse battery staple' },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'INVALID_CREDENTIALS' });
    }
  });

  it('uses a generic forgot-password response whether or not the account exists', async () => {
    for (const found of [null, { id: 'user-id', passwordHash: 'hash', tenantId: 'tenant-id' }]) {
      const app = await make(repository({ findUserForLogin: vi.fn().mockResolvedValue(found) }));
      const response = await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: 'owner@example.com' },
      });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({
        message: 'If that account exists, a reset message has been sent.',
      });
    }
  });

  it('accepts a valid verification token once and rejects invalid or reused tokens', async () => {
    const consumeToken = vi
      .fn()
      .mockResolvedValueOnce({ userId: 'user-id' })
      .mockResolvedValue(null);
    const auth = repository({ consumeToken });
    const app = await make(auth);
    const token = 'a'.repeat(43);
    expect(
      (await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token } }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/auth/verify-email', payload: { token } }))
        .statusCode,
    ).toBe(400);
    expect(auth.markEmailVerified).toHaveBeenCalledWith('user-id');
  });

  it('revokes all sessions after a successful password reset', async () => {
    const auth = repository({ consumeToken: vi.fn().mockResolvedValue({ userId: 'user-id' }) });
    const app = await make(auth);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: {
        token: 'a'.repeat(43),
        password: 'an entirely new secure passphrase',
        passwordConfirmation: 'an entirely new secure passphrase',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(auth.updatePassword).toHaveBeenCalledWith('user-id', expect.any(String));
  });

  it('rejects unauthenticated profile and session access', async () => {
    const app = await make(repository());
    for (const url of ['/account/profile', '/account/sessions']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'UNAUTHENTICATED' });
    }
  });

  it('scopes individual session revocation to the authenticated user', async () => {
    const revokeSession = vi.fn().mockResolvedValue(true);
    const auth = repository({
      getSession: vi.fn().mockResolvedValue(authenticated),
      revokeSession,
    });
    const app = await make(auth);
    const other = '22222222-2222-4222-8222-222222222222';
    const response = await app.inject({
      method: 'DELETE',
      url: `/account/sessions/${other}`,
      cookies: { session: 'opaque-token' },
    });
    expect(response.statusCode).toBe(204);
    expect(revokeSession).toHaveBeenCalledWith('user-id', other);
  });
});
