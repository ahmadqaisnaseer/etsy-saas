import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { PoolClient } from 'pg';
import type {
  AuthenticatedSession,
  AuthRepository,
  RegisterInput,
  SessionMetadata,
} from './types.js';
import { normalizeEmail, slugify } from './security.js';

type UserRow = { id: string; email: string; display_name: string; password_hash: string };
type TenantRow = {
  id: string;
  name: string;
  slug: string;
  role: AuthenticatedSession['tenants'][number]['role'];
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

  async close(): Promise<void> {
    await this.pool.end();
  }

  async healthCheck(): Promise<void> {
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
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const membership = await client.query(
        'SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2',
        [tenantId, userId],
      );
      if (!membership.rowCount) throw new Error('TENANT_ACCESS_DENIED');
      return work(client);
    });
  }

  async register(input: RegisterInput, passwordHash: string): Promise<AuthenticatedSession> {
    return this.transaction(async (client) => {
      const tenantId = randomUUID();
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const user = await client.query<UserRow>(
        `INSERT INTO users(email, password_hash, display_name)
         VALUES ($1, $2, $3) RETURNING id, email, display_name, password_hash`,
        [normalizeEmail(input.email), passwordHash, input.displayName.trim()],
      );
      const userId = user.rows[0]!.id;
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
      const tenant = await client.query<TenantRow>(
        `INSERT INTO tenants(id, name, slug) VALUES ($1, $2, $3)
         RETURNING id, name, slug, 'owner'::text AS role`,
        [tenantId, input.organizationName.trim(), slugify(input.organizationName)],
      );
      await client.query(
        `INSERT INTO memberships(tenant_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [tenantId, userId],
      );
      await client.query(`INSERT INTO tenant_settings(tenant_id, object_prefix) VALUES ($1, $2)`, [
        tenantId,
        `tenants/${tenantId}/`,
      ]);
      return { sessionId: '', user: mapUser(user.rows[0]!), tenants: tenant.rows };
    });
  }

  async findUserForLogin(email: string): Promise<{ id: string; passwordHash: string } | null> {
    const result = await this.pool.query<UserRow>(
      'SELECT id, password_hash, email, display_name FROM users WHERE email = $1',
      [normalizeEmail(email)],
    );
    const user = result.rows[0];
    return user ? { id: user.id, passwordHash: user.password_hash } : null;
  }

  async createSession(
    userId: string,
    tokenHash: Buffer,
    metadata: SessionMetadata,
  ): Promise<AuthenticatedSession> {
    return this.transaction(async (client) => {
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
      const session = await client.query<{ id: string }>(
        `INSERT INTO sessions(user_id, token_hash, expires_at, user_agent, ip_address)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          userId,
          tokenHash,
          metadata.expiresAt,
          metadata.userAgent ?? null,
          metadata.ipAddress ?? null,
        ],
      );
      return this.loadSession(client, session.rows[0]!.id, userId);
    });
  }

  async getSession(tokenHash: Buffer): Promise<AuthenticatedSession | null> {
    return this.transaction(async (client) => {
      const session = await client.query<{ id: string; user_id: string }>(
        `SELECT id, user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()`,
        [tokenHash],
      );
      const row = session.rows[0];
      if (!row) return null;
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [row.user_id]);
      await client.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.id]);
      return this.loadSession(client, row.id, row.user_id);
    });
  }

  async deleteSession(tokenHash: Buffer): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  private async loadSession(
    client: PoolClient,
    sessionId: string,
    userId: string,
  ): Promise<AuthenticatedSession> {
    const user = await client.query<UserRow>(
      'SELECT id, email, display_name, password_hash FROM users WHERE id = $1',
      [userId],
    );
    const tenants = await client.query<TenantRow>(
      `SELECT t.id, t.name, t.slug, m.role
       FROM memberships m JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = $1 ORDER BY t.name`,
      [userId],
    );
    return { sessionId, user: mapUser(user.rows[0]!), tenants: tenants.rows };
  }
}

const mapUser = (row: UserRow): AuthenticatedSession['user'] => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
});
