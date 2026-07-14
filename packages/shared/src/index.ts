import { z } from 'zod';

export const environmentSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  WEB_ORIGIN: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_COOKIE_NAME: z.string().default('etsy_saas_session'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(720).default(168),
  VERIFICATION_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(60),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().max(240).default(30),
  APP_BASE_URL: z.string().url().default('http://localhost:5173'),
  EMAIL_FROM_NAME: z.string().default('Etsy SaaS'),
  EMAIL_FROM_ADDRESS: z.string().email().default('noreply@example.test'),
  PASSWORD_PEPPER: z.string().min(32),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ETSY_INTEGRATION_ENABLED: z
    .literal('false')
    .default('false')
    .transform(() => false as const),
});
export type Environment = z.infer<typeof environmentSchema>;
export const parseEnvironment = (input: NodeJS.ProcessEnv): Environment =>
  environmentSchema.parse(input);
export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerified?: boolean;
};
export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
};
