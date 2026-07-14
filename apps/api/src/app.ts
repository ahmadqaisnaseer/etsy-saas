import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Environment } from '@etsy-saas/shared';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from './security.js';
import type { AuthenticatedSession, AuthRepository, ReadinessChecks } from './types.js';

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
});

const registerSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1).max(100),
  organizationName: z.string().trim().min(2).max(120),
});

export type AppDependencies = {
  env: Environment;
  auth: AuthRepository;
  readiness: ReadinessChecks;
  logger?: boolean;
};

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ?? {
      level: deps.env.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    trustProxy: true,
    bodyLimit: 1_048_576,
    requestTimeout: 15_000,
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: deps.env.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE'],
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  app.addHook('onRequest', async (request, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin && origin !== deps.env.WEB_ORIGIN) {
      return reply.code(403).send({ error: 'ORIGIN_NOT_ALLOWED' });
    }
  });

  app.get('/health/live', () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    const checks = await Promise.allSettled([
      deps.readiness.database(),
      deps.readiness.redis(),
      deps.readiness.storage(),
    ]);
    const names = ['database', 'redis', 'storage'] as const;
    const details = {
      [names[0]]: checks[0].status === 'fulfilled' ? 'ok' : 'unavailable',
      [names[1]]: checks[1].status === 'fulfilled' ? 'ok' : 'unavailable',
      [names[2]]: checks[2].status === 'fulfilled' ? 'ok' : 'unavailable',
    };
    const ready = checks.every((check) => check.status === 'fulfilled');
    return reply
      .code(ready ? 200 : 503)
      .send({ status: ready ? 'ok' : 'degraded', checks: details });
  });

  app.post(
    '/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const input = registerSchema.parse(request.body);
      const passwordHash = await hashPassword(input.password, deps.env.PASSWORD_PEPPER);
      const registered = await deps.auth.register(input, passwordHash);
      const { token, session } = await establishSession(deps, registered.user.id, request);
      setSessionCookie(reply, deps.env, token);
      return reply.code(201).send(session);
    },
  );

  app.post(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      const input = credentialsSchema.parse(request.body);
      const user = await deps.auth.findUserForLogin(input.email);
      if (
        !user ||
        !(await verifyPassword(user.passwordHash, input.password, deps.env.PASSWORD_PEPPER))
      ) {
        return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
      }
      const { token, session } = await establishSession(deps, user.id, request);
      setSessionCookie(reply, deps.env, token);
      return session;
    },
  );

  app.get('/auth/session', async (request, reply) => {
    const session = await readSession(deps, request);
    if (!session) return reply.code(401).send({ error: 'UNAUTHENTICATED' });
    return session;
  });

  app.delete('/auth/session', async (request, reply) => {
    const token = request.cookies[deps.env.SESSION_COOKIE_NAME];
    if (token) await deps.auth.deleteSession(hashSessionToken(token));
    reply.clearCookie(deps.env.SESSION_COOKIE_NAME, cookieOptions(deps.env));
    return reply.code(204).send();
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ error: 'INVALID_REQUEST', issues: error.flatten().fieldErrors });
    if ((error as { code?: string }).code === '23505')
      return reply.code(409).send({ error: 'ACCOUNT_ALREADY_EXISTS' });
    app.log.error(error);
    return reply.code(500).send({ error: 'INTERNAL_SERVER_ERROR' });
  });

  return app;
}

async function establishSession(deps: AppDependencies, userId: string, request: FastifyRequest) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + deps.env.SESSION_TTL_HOURS * 60 * 60 * 1_000);
  const metadata = {
    expiresAt,
    ...(request.headers['user-agent'] ? { userAgent: request.headers['user-agent'] } : {}),
    ...(request.ip ? { ipAddress: request.ip } : {}),
  };
  const session = await deps.auth.createSession(userId, hashSessionToken(token), metadata);
  return { token, session };
}

async function readSession(
  deps: AppDependencies,
  request: FastifyRequest,
): Promise<AuthenticatedSession | null> {
  const token = request.cookies[deps.env.SESSION_COOKIE_NAME];
  return token ? deps.auth.getSession(hashSessionToken(token)) : null;
}

const cookieOptions = (env: Environment) => ({
  path: '/',
  httpOnly: true,
  secure: env.APP_ENV !== 'development' && env.APP_ENV !== 'test',
  sameSite: 'strict' as const,
});

const setSessionCookie = (reply: FastifyReply, env: Environment, token: string) => {
  reply.setCookie(env.SESSION_COOKIE_NAME, token, {
    ...cookieOptions(env),
    maxAge: env.SESSION_TTL_HOURS * 60 * 60,
  });
};
