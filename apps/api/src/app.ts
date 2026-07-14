import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Environment } from '@etsy-saas/shared';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  verifyPassword,
} from './security.js';
import type {
  AuthenticatedSession,
  AuthRepository,
  EmailProvider,
  ReadinessChecks,
} from './types.js';
const weak = new Set([
  'password1234',
  'password12345',
  'qwerty123456',
  'letmein123456',
  '123456789012',
]);
const password = z.string().min(12).max(1024);
const name = z.string().trim().min(1).max(80);
const register = z
  .object({
    firstName: name,
    lastName: name,
    email: z.string().trim().email().max(254),
    password,
    passwordConfirmation: z.string(),
    acceptedTerms: z.literal(true),
    acceptedPrivacy: z.literal(true),
    organizationName: z.string().trim().min(2).max(120).optional(),
  })
  .superRefine((v, c) => {
    if (v.password !== v.passwordConfirmation)
      c.addIssue({
        code: 'custom',
        path: ['passwordConfirmation'],
        message: 'Passwords must match',
      });
    if (
      normalizeEmail(v.password) === normalizeEmail(v.email) ||
      weak.has(v.password.toLowerCase())
    )
      c.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Choose a stronger password',
      });
  });
const credentials = z.object({ email: z.string().trim().email().max(254), password });
const token = z.object({ token: z.string().min(32).max(256) });
const profile = z.object({ firstName: name, lastName: name });
export type AppDependencies = {
  env: Environment;
  auth: AuthRepository;
  readiness: ReadinessChecks;
  email?: EmailProvider;
  logger?: boolean;
};
export async function buildApp(deps: AppDependencies) {
  const app = Fastify({
    logger: deps.logger ?? {
      level: deps.env.LOG_LEVEL,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'body.password',
        'body.passwordConfirmation',
        'body.token',
      ],
    },
    trustProxy: true,
    bodyLimit: 1_048_576,
    requestTimeout: 15_000,
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: deps.env.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  app.addHook('onRequest', async (req, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origin = req.headers.origin;
    if (origin && origin !== deps.env.WEB_ORIGIN)
      return reply.code(403).send({ error: 'ORIGIN_NOT_ALLOWED' });
  });
  app.get('/health/live', () => ({ status: 'ok' }));
  app.get('/health/ready', async (_r, reply) => {
    const x = await Promise.allSettled([
      deps.readiness.database(),
      deps.readiness.redis(),
      deps.readiness.storage(),
    ]);
    const checks = {
      database: x[0].status === 'fulfilled' ? 'ok' : 'unavailable',
      redis: x[1].status === 'fulfilled' ? 'ok' : 'unavailable',
      storage: x[2].status === 'fulfilled' ? 'ok' : 'unavailable',
    };
    return reply.code(x.every((v) => v.status === 'fulfilled') ? 200 : 503).send({
      status: x.every((v) => v.status === 'fulfilled') ? 'ok' : 'degraded',
      checks,
    });
  });
  app.post(
    '/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const input = register.parse(req.body);
      const passwordHash = await hashPassword(input.password, deps.env.PASSWORD_PEPPER);
      const registered = await deps.auth.register(input, passwordHash);
      await sendToken(deps, 'verification', registered.user.id, registered.user.email);
      await deps.auth.audit?.(
        'auth.verification.requested',
        registered.user.id,
        registered.tenants[0]?.id,
      );
      const session = await establish(deps, registered.user.id, req);
      setCookie(reply, deps.env, session.token);
      return reply.code(201).send(session.value);
    },
  );
  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (req, reply) => {
      const input = credentials.parse(req.body);
      const user = await deps.auth.findUserForLogin(input.email);
      if (
        !user ||
        !(await verifyPassword(user.passwordHash, input.password, deps.env.PASSWORD_PEPPER))
      ) {
        await deps.auth.audit?.('auth.login.failed', undefined, undefined, {
          emailHash: hashSessionToken(normalizeEmail(input.email)).toString('hex'),
        });
        return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
      }
      const s = await establish(deps, user.id, req);
      await deps.auth.audit?.('auth.login.succeeded', user.id, user.tenantId);
      setCookie(reply, deps.env, s.token);
      return s.value;
    },
  );
  app.post('/auth/logout', logout);
  app.delete('/auth/session', logout);
  async function logout(req: FastifyRequest, reply: FastifyReply) {
    const current = await session(deps, req);
    const raw = req.cookies[deps.env.SESSION_COOKIE_NAME];
    if (raw) await deps.auth.deleteSession(hashSessionToken(raw));
    await deps.auth.audit?.('auth.logout', current?.user.id, current?.tenants[0]?.id);
    reply.clearCookie(deps.env.SESSION_COOKIE_NAME, cookieOptions(deps.env));
    return reply.code(204).send();
  }
  app.get('/auth/session', async (req, reply) => {
    const s = await session(deps, req);
    return s ?? reply.code(401).send({ error: 'UNAUTHENTICATED' });
  });
  app.post(
    '/auth/resend-verification',
    { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const s = await requireSession(deps, req, reply);
      if (!s) return;
      await sendToken(deps, 'verification', s.user.id, s.user.email);
      await deps.auth.audit?.('auth.verification.requested', s.user.id, s.tenants[0]?.id);
      return reply.code(202).send({
        message: 'If eligible, a verification message has been sent.',
      });
    },
  );
  app.post('/auth/verify-email', async (req, reply) => {
    const v = token.parse(req.body);
    const used = await deps.auth.consumeToken?.('verification', hashSessionToken(v.token));
    if (!used) return reply.code(400).send({ error: 'TOKEN_INVALID_OR_EXPIRED' });
    await deps.auth.markEmailVerified?.(used.userId);
    await deps.auth.audit?.('auth.email.verified', used.userId);
    return { verified: true };
  });
  app.post(
    '/auth/forgot-password',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const { email } = z.object({ email: z.string().trim().email() }).parse(req.body);
      const user = await deps.auth.findUserForLogin(email);
      if (user) {
        await sendToken(deps, 'reset', user.id, normalizeEmail(email));
        await deps.auth.audit?.('auth.password_reset.requested', user.id, user.tenantId);
      }
      return reply.code(202).send({
        message: 'If that account exists, a reset message has been sent.',
      });
    },
  );
  app.post('/auth/reset-password', async (req, reply) => {
    const v = z
      .object({
        token: z.string().min(32),
        password,
        passwordConfirmation: z.string(),
      })
      .parse(req.body);
    if (v.password !== v.passwordConfirmation || weak.has(v.password.toLowerCase()))
      return reply.code(400).send({ error: 'WEAK_OR_MISMATCHED_PASSWORD' });
    const used = await deps.auth.consumeToken?.('reset', hashSessionToken(v.token));
    if (!used) return reply.code(400).send({ error: 'TOKEN_INVALID_OR_EXPIRED' });
    await deps.auth.updatePassword?.(
      used.userId,
      await hashPassword(v.password, deps.env.PASSWORD_PEPPER),
    );
    await deps.auth.audit?.('auth.password_reset.completed', used.userId);
    return { reset: true };
  });
  app.get('/account/profile', async (req, reply) => {
    const s = await requireSession(deps, req, reply);
    if (!s) return;
    return deps.auth.getProfile?.(s.user.id, s.tenants[0]!.id);
  });
  app.patch('/account/profile', async (req, reply) => {
    const s = await requireSession(deps, req, reply);
    if (!s) return;
    const v = profile.parse(req.body);
    await deps.auth.updateProfile?.(s.user.id, v.firstName, v.lastName);
    await deps.auth.audit?.('account.profile.updated', s.user.id, s.tenants[0]?.id);
    return reply.code(204).send();
  });
  app.post('/account/change-password', async (req, reply) => {
    const s = await requireSession(deps, req, reply);
    if (!s) return;
    const v = z
      .object({
        currentPassword: z.string(),
        password,
        passwordConfirmation: z.string(),
      })
      .parse(req.body);
    const user = await deps.auth.findUserForLogin(s.user.email);
    if (
      !user ||
      !(await verifyPassword(user.passwordHash, v.currentPassword, deps.env.PASSWORD_PEPPER))
    )
      return reply.code(400).send({ error: 'CURRENT_PASSWORD_INVALID' });
    if (v.password !== v.passwordConfirmation)
      return reply.code(400).send({ error: 'PASSWORD_MISMATCH' });
    await deps.auth.updatePassword?.(
      s.user.id,
      await hashPassword(v.password, deps.env.PASSWORD_PEPPER),
      s.sessionId,
    );
    await deps.auth.audit?.('auth.password.changed', s.user.id, s.tenants[0]?.id);
    return reply.code(204).send();
  });
  app.get('/account/sessions', async (req, reply) => {
    const s = await requireSession(deps, req, reply);
    if (!s) return;
    return deps.auth.listSessions?.(s.user.id, s.sessionId);
  });
  app.delete('/account/sessions/:sessionId', async (req, reply) => {
    const s = await requireSession(deps, req, reply);
    if (!s) return;
    const id = z.object({ sessionId: z.string().uuid() }).parse(req.params).sessionId;
    if (id === s.sessionId)
      return reply.code(400).send({ error: 'USE_LOGOUT_FOR_CURRENT_SESSION' });
    if (!(await deps.auth.revokeSession?.(s.user.id, id)))
      return reply.code(404).send({ error: 'SESSION_NOT_FOUND' });
    await deps.auth.audit?.('auth.session.revoked', s.user.id, s.tenants[0]?.id);
    return reply.code(204).send();
  });
  app.post('/account/sessions/revoke-others', async (req, reply) => {
    const s = await requireSession(deps, req, reply);
    if (!s) return;
    const count = await deps.auth.revokeOtherSessions?.(s.user.id, s.sessionId);
    await deps.auth.audit?.('auth.sessions.others_revoked', s.user.id, s.tenants[0]?.id, { count });
    return { revoked: count ?? 0 };
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: 'INVALID_REQUEST',
        issues: error.flatten().fieldErrors,
      });
    if ((error as { code?: string }).code === '23505')
      return reply.code(409).send({ error: 'ACCOUNT_ALREADY_EXISTS' });
    app.log.error(error);
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR' });
  });
  return app;
}
async function sendToken(
  deps: AppDependencies,
  kind: 'verification' | 'reset',
  userId: string,
  email: string,
) {
  const raw = createSessionToken();
  const minutes =
    kind === 'verification'
      ? deps.env.VERIFICATION_TOKEN_TTL_MINUTES
      : deps.env.PASSWORD_RESET_TOKEN_TTL_MINUTES;
  await deps.auth.issueToken?.(
    kind,
    userId,
    hashSessionToken(raw),
    new Date(Date.now() + minutes * 60000),
  );
  const url = `${deps.env.APP_BASE_URL}/${kind === 'verification' ? 'verify-email' : 'reset-password'}?token=${encodeURIComponent(raw)}`;
  await deps.email?.send({
    to: email,
    subject: kind === 'verification' ? 'Verify your email' : 'Reset your password',
    text: url,
  });
  return { raw };
}
async function establish(deps: AppDependencies, userId: string, req: FastifyRequest) {
  const token = createSessionToken();
  const value = await deps.auth.createSession(userId, hashSessionToken(token), {
    expiresAt: new Date(Date.now() + deps.env.SESSION_TTL_HOURS * 3600000),
    ...(req.headers['user-agent'] ? { userAgent: req.headers['user-agent'] } : {}),
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  return { token, value };
}
async function session(
  deps: AppDependencies,
  req: FastifyRequest,
): Promise<AuthenticatedSession | null> {
  const raw = req.cookies[deps.env.SESSION_COOKIE_NAME];
  return raw ? deps.auth.getSession(hashSessionToken(raw)) : null;
}
async function requireSession(deps: AppDependencies, req: FastifyRequest, reply: FastifyReply) {
  const s = await session(deps, req);
  if (!s) {
    reply.code(401).send({ error: 'UNAUTHENTICATED' });
    return null;
  }
  return s;
}
const cookieOptions = (env: Environment) => ({
  path: '/',
  httpOnly: true,
  secure: env.APP_ENV === 'staging' || env.APP_ENV === 'production',
  sameSite: 'lax' as const,
});
const setCookie = (r: FastifyReply, e: Environment, t: string) =>
  r.setCookie(e.SESSION_COOKIE_NAME, t, {
    ...cookieOptions(e),
    maxAge: e.SESSION_TTL_HOURS * 3600,
  });
