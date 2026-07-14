import type { SessionUser, TenantSummary } from '@etsy-saas/shared';

export type AuthenticatedSession = {
  sessionId: string;
  user: SessionUser;
  tenants: TenantSummary[];
};

export type RegisterInput = {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
};

export interface AuthRepository {
  register(input: RegisterInput, passwordHash: string): Promise<AuthenticatedSession>;
  findUserForLogin(email: string): Promise<{ id: string; passwordHash: string } | null>;
  createSession(
    userId: string,
    tokenHash: Buffer,
    metadata: SessionMetadata,
  ): Promise<AuthenticatedSession>;
  getSession(tokenHash: Buffer): Promise<AuthenticatedSession | null>;
  deleteSession(tokenHash: Buffer): Promise<void>;
}

export type SessionMetadata = { userAgent?: string; ipAddress?: string; expiresAt: Date };

export interface ReadinessChecks {
  database(): Promise<void>;
  redis(): Promise<void>;
  storage(): Promise<void>;
}
