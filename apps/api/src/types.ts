import type { SessionUser, TenantSummary } from '@etsy-saas/shared';

export type AuthenticatedSession = {
  sessionId: string;
  user: SessionUser;
  tenants: TenantSummary[];
};

export type RegisterInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  organizationName?: string | undefined;
  acceptedTerms: true;
  acceptedPrivacy: true;
};

export type SessionMetadata = {
  userAgent?: string;
  ipAddress?: string;
  expiresAt: Date;
};
export type SafeSession = {
  id: string;
  current: boolean;
  createdAt: string;
  lastActivityAt: string;
  userAgent: string | null;
};
export type AccountProfile = {
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  organization: {
    id: string;
    name: string;
    role: 'owner' | 'admin' | 'member';
  };
};

export interface AuthRepository {
  register(input: RegisterInput, passwordHash: string): Promise<AuthenticatedSession>;
  findUserForLogin(
    email: string,
  ): Promise<{ id: string; passwordHash: string; tenantId?: string } | null>;
  createSession(
    userId: string,
    tokenHash: Buffer,
    metadata: SessionMetadata,
  ): Promise<AuthenticatedSession>;
  getSession(tokenHash: Buffer): Promise<AuthenticatedSession | null>;
  deleteSession(tokenHash: Buffer): Promise<void>;
  issueToken?(
    kind: 'verification' | 'reset',
    userId: string,
    tokenHash: Buffer,
    expiresAt: Date,
  ): Promise<void>;
  consumeToken?(
    kind: 'verification' | 'reset',
    tokenHash: Buffer,
  ): Promise<{ userId: string } | null>;
  markEmailVerified?(userId: string): Promise<void>;
  updatePassword?(userId: string, passwordHash: string, keepSessionId?: string): Promise<void>;
  getProfile?(userId: string, tenantId: string): Promise<AccountProfile>;
  updateProfile?(userId: string, firstName: string, lastName: string): Promise<void>;
  listSessions?(userId: string, currentSessionId: string): Promise<SafeSession[]>;
  revokeSession?(userId: string, sessionId: string): Promise<boolean>;
  revokeOtherSessions?(userId: string, currentSessionId: string): Promise<number>;
  audit?(
    event: string,
    userId?: string,
    tenantId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
}

export interface EmailProvider {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}
export interface ReadinessChecks {
  database(): Promise<void>;
  redis(): Promise<void>;
  storage(): Promise<void>;
}
