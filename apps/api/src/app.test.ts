import type { Environment } from '@etsy-saas/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import type { AuthRepository } from './types.js';

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
  EMAIL_FROM_ADDRESS: 'test@example.test',
  PASSWORD_PEPPER: 'a-secure-test-pepper-that-is-long-enough',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'test-bucket',
  S3_ACCESS_KEY: 'test',
  S3_SECRET_KEY: 'test',
  S3_FORCE_PATH_STYLE: true,
  ETSY_INTEGRATION_ENABLED: false,
};

const session = {
  sessionId: 'session-id',
  user: { id: 'user-id', email: 'owner@example.com', displayName: 'Owner' },
  tenants: [{ id: 'tenant-id', name: 'Acme', slug: 'acme', role: 'owner' as const }],
};

const auth = (): AuthRepository => ({
  register: vi.fn().mockResolvedValue({ ...session, sessionId: '' }),
  findUserForLogin: vi.fn().mockResolvedValue(null),
  createSession: vi.fn().mockResolvedValue(session),
  getSession: vi.fn().mockResolvedValue(session),
  deleteSession: vi.fn().mockResolvedValue(undefined),
});

describe('API', () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('reports liveness without querying dependencies', async () => {
    const database = vi.fn();
    const app = await buildApp({
      env,
      auth: auth(),
      readiness: { database, redis: vi.fn(), storage: vi.fn() },
      logger: false,
    });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(database).not.toHaveBeenCalled();
  });

  it('returns 503 with component status when a dependency is unavailable', async () => {
    const app = await buildApp({
      env,
      auth: auth(),
      readiness: {
        database: vi.fn().mockResolvedValue(undefined),
        redis: vi.fn().mockRejectedValue(new Error('down')),
        storage: vi.fn().mockResolvedValue(undefined),
      },
      logger: false,
    });
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'degraded',
      checks: { database: 'ok', redis: 'unavailable', storage: 'ok' },
    });
  });

  it('rejects cross-origin writes', async () => {
    const app = await buildApp({
      env,
      auth: auth(),
      readiness: { database: vi.fn(), redis: vi.fn(), storage: vi.fn() },
      logger: false,
    });
    apps.push(app);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: 'https://evil.example' },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
  });

  it('returns an authenticated cookie session', async () => {
    const app = await buildApp({
      env,
      auth: auth(),
      readiness: { database: vi.fn(), redis: vi.fn(), storage: vi.fn() },
      logger: false,
    });
    apps.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/auth/session',
      cookies: { session: 'opaque-token' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ user: { email: string } }>().user.email).toBe('owner@example.com');
  });
});
