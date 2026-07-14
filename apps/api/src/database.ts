import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { PoolClient } from 'pg';
import type {
  AccountProfile,
  AuthenticatedSession,
  AuthRepository,
  RegisterInput,
  SafeSession,
  SessionMetadata,
} from './types.js';
import { normalizeEmail, slugify } from './security.js';

type UserRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  password_hash: string;
  email_verified_at: Date | null;
};
type TenantRow = {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
};

export class Database implements AuthRepository {
  readonly pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'etsy-saas-api',
    });
  }
  async close() {
    await this.pool.end();
  }
  async healthCheck() {
    await this.pool.query('SELECT 1');
  }
  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async withTenant<T>(
    userId: string,
    tenantId: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.transaction(async (client) => {
      await client.query("SELECT set_config('app.current_user_id',$1,true)", [userId]);
      await client.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantId]);
      const membership = await client.query(
        'SELECT role FROM memberships WHERE tenant_id=$1 AND user_id=$2',
        [tenantId, userId],
      );
      if (!membership.rowCount) throw new Error('TENANT_ACCESS_DENIED');
      return work(client);
    });
  }
  async register(input: RegisterInput, passwordHash: string): Promise<AuthenticatedSession> {
    return this.transaction(async (client) => {
      const tenantId = randomUUID();
      await client.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantId]);
      const user = await client.query<UserRow>(
        `INSERT INTO users(email,password_hash,display_name,first_name,last_name) VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [
          normalizeEmail(input.email),
          passwordHash,
          `${input.firstName.trim()} ${input.lastName.trim()}`,
          input.firstName.trim(),
          input.lastName.trim(),
        ],
      );
      const userId = user.rows[0]!.id;
      await client.query("SELECT set_config('app.current_user_id',$1,true)", [userId]);
      const name = input.organizationName?.trim() || `${input.firstName.trim()}'s Workspace`;
      const tenant = await client.query<TenantRow>(
        `INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3) RETURNING id,name,slug,'owner'::text AS role`,
        [tenantId, name, slugify(name)],
      );
      await client.query(`INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'owner')`, [
        tenantId,
        userId,
      ]);
      await client.query(`INSERT INTO tenant_settings(tenant_id,object_prefix) VALUES($1,$2)`, [
        tenantId,
        `tenants/${tenantId}/`,
      ]);
      await client.query(
        `INSERT INTO security_audit_events(tenant_id,actor_user_id,event_name) VALUES($1,$2,'auth.registration.completed')`,
        [tenantId, userId],
      );
      return {
        sessionId: '',
        user: mapUser(user.rows[0]!),
        tenants: tenant.rows,
      };
    });
  }
  async findUserForLogin(email: string) {
    const r = await this.pool.query<UserRow & { tenant_id: string }>(
      `SELECT u.*,m.tenant_id FROM users u LEFT JOIN memberships m ON m.user_id=u.id WHERE u.email=$1 ORDER BY m.created_at LIMIT 1`,
      [normalizeEmail(email)],
    );
    const u = r.rows[0];
    return u ? { id: u.id, passwordHash: u.password_hash, tenantId: u.tenant_id } : null;
  }
  async createSession(userId: string, tokenHash: Buffer, metadata: SessionMetadata) {
    return this.transaction(async (client) => {
      await client.query("SELECT set_config('app.current_user_id',$1,true)", [userId]);
      const s = await client.query<{ id: string }>(
        `INSERT INTO sessions(user_id,token_hash,expires_at,user_agent,ip_address) VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [
          userId,
          tokenHash,
          metadata.expiresAt,
          metadata.userAgent ?? null,
          metadata.ipAddress ?? null,
        ],
      );
      return this.loadSession(client, s.rows[0]!.id, userId);
    });
  }
  async getSession(tokenHash: Buffer) {
    return this.transaction(async (client) => {
      const s = await client.query<{ id: string; user_id: string }>(
        `SELECT id,user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()`,
        [tokenHash],
      );
      const row = s.rows[0];
      if (!row) return null;
      await client.query("SELECT set_config('app.current_user_id',$1,true)", [row.user_id]);
      await client.query('UPDATE sessions SET last_seen_at=now() WHERE id=$1', [row.id]);
      return this.loadSession(client, row.id, row.user_id);
    });
  }
  async deleteSession(tokenHash: Buffer) {
    await this.pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash]);
  }
  async issueToken(
    kind: 'verification' | 'reset',
    userId: string,
    tokenHash: Buffer,
    expiresAt: Date,
  ) {
    const table = kind === 'verification' ? 'email_verification_tokens' : 'password_reset_tokens';
    await this.transaction(async (c) => {
      await c.query(
        `UPDATE ${table} SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL`,
        [userId],
      );
      await c.query(`INSERT INTO ${table}(user_id,token_hash,expires_at) VALUES($1,$2,$3)`, [
        userId,
        tokenHash,
        expiresAt,
      ]);
    });
  }
  async consumeToken(kind: 'verification' | 'reset', tokenHash: Buffer) {
    const table = kind === 'verification' ? 'email_verification_tokens' : 'password_reset_tokens';
    return this.transaction(async (c) => {
      const r = await c.query<{ user_id: string }>(
        `UPDATE ${table} SET consumed_at=now() WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING user_id`,
        [tokenHash],
      );
      return r.rows[0] ? { userId: r.rows[0].user_id } : null;
    });
  }
  async markEmailVerified(userId: string) {
    await this.pool.query(
      'UPDATE users SET email_verified_at=COALESCE(email_verified_at,now()),updated_at=now() WHERE id=$1',
      [userId],
    );
  }
  async updatePassword(userId: string, passwordHash: string, keepSessionId?: string) {
    await this.transaction(async (c) => {
      await c.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1', [
        userId,
        passwordHash,
      ]);
      await c.query(
        keepSessionId
          ? 'DELETE FROM sessions WHERE user_id=$1 AND id<>$2'
          : 'DELETE FROM sessions WHERE user_id=$1',
        keepSessionId ? [userId, keepSessionId] : [userId],
      );
    });
  }
  async getProfile(userId: string, tenantId: string): Promise<AccountProfile> {
    return this.withTenant(userId, tenantId, async (c) => {
      const r = await c.query<
        UserRow & {
          created_at: Date;
          tenant_name: string;
          role: 'owner' | 'admin' | 'member';
        }
      >(
        `SELECT u.*,u.created_at,t.name tenant_name,m.role FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id WHERE u.id=$1 AND t.id=$2`,
        [userId, tenantId],
      );
      const x = r.rows[0]!;
      return {
        firstName: x.first_name,
        lastName: x.last_name,
        email: x.email,
        emailVerified: !!x.email_verified_at,
        createdAt: x.created_at.toISOString(),
        organization: { id: tenantId, name: x.tenant_name, role: x.role },
      };
    });
  }
  async updateProfile(userId: string, firstName: string, lastName: string) {
    await this.pool.query(
      `UPDATE users SET first_name=$2,last_name=$3,display_name=$2||' '||$3,updated_at=now() WHERE id=$1`,
      [userId, firstName, lastName],
    );
  }
  async listSessions(userId: string, currentSessionId: string): Promise<SafeSession[]> {
    const r = await this.pool.query<{
      id: string;
      created_at: Date;
      last_seen_at: Date;
      user_agent: string | null;
    }>(
      `SELECT id,created_at,last_seen_at,user_agent FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY last_seen_at DESC`,
      [userId],
    );
    return r.rows.map((x) => ({
      id: x.id,
      current: x.id === currentSessionId,
      createdAt: x.created_at.toISOString(),
      lastActivityAt: x.last_seen_at.toISOString(),
      userAgent: x.user_agent,
    }));
  }
  async revokeSession(userId: string, sessionId: string) {
    const r = await this.pool.query('DELETE FROM sessions WHERE id=$1 AND user_id=$2', [
      sessionId,
      userId,
    ]);
    return !!r.rowCount;
  }
  async revokeOtherSessions(userId: string, currentSessionId: string) {
    const r = await this.pool.query('DELETE FROM sessions WHERE user_id=$1 AND id<>$2', [
      userId,
      currentSessionId,
    ]);
    return r.rowCount ?? 0;
  }
  async audit(
    event: string,
    userId?: string,
    tenantId?: string,
    metadata: Record<string, unknown> = {},
  ) {
    await this.transaction(async (client) => {
      if (userId) await client.query("SELECT set_config('app.current_user_id',$1,true)", [userId]);
      if (tenantId)
        await client.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantId]);
      await client.query(
        `INSERT INTO security_audit_events(tenant_id,actor_user_id,event_name,metadata) VALUES($1,$2,$3,$4)`,
        [tenantId ?? null, userId ?? null, event, metadata],
      );
    });
  }
  private async loadSession(
    client: PoolClient,
    sessionId: string,
    userId: string,
  ): Promise<AuthenticatedSession> {
    const user = await client.query<UserRow>('SELECT * FROM users WHERE id=$1', [userId]);
    const tenants = await client.query<TenantRow>(
      `SELECT t.id,t.name,t.slug,m.role FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 ORDER BY t.name`,
      [userId],
    );
    return { sessionId, user: mapUser(user.rows[0]!), tenants: tenants.rows };
  }
}
const mapUser = (u: UserRow): AuthenticatedSession['user'] => ({
  id: u.id,
  email: u.email,
  displayName: `${u.first_name} ${u.last_name}`,
  emailVerified: !!u.email_verified_at,
});
