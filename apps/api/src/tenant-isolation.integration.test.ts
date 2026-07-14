import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.DATABASE_ADMIN_URL;
const suite = connectionString ? describe : describe.skip;

suite('PostgreSQL tenant isolation', () => {
  const admin = new pg.Client({ connectionString });
  const runtime = new pg.Client({ connectionString });
  const userId = randomUUID();
  const tenantA = randomUUID();
  const tenantB = randomUUID();

  beforeAll(async () => {
    await Promise.all([admin.connect(), runtime.connect()]);
    await admin.query(
      `INSERT INTO users(id,email,password_hash,display_name) VALUES ($1,$2,'hash','Test')`,
      [userId, `${userId}@example.com`],
    );
    await admin.query(`INSERT INTO tenants(id,name,slug) VALUES ($1,'A',$2),($3,'B',$4)`, [
      tenantA,
      `a-${tenantA}`,
      tenantB,
      `b-${tenantB}`,
    ]);
    await admin.query(
      `INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$3,'owner'),($2,$3,'owner')`,
      [tenantA, tenantB, userId],
    );
    await admin.query(
      `INSERT INTO stored_objects(tenant_id,object_key,content_type,byte_size) VALUES ($1,'a.txt','text/plain',1),($2,'b.txt','text/plain',1)`,
      [tenantA, tenantB],
    );
    await runtime.query('SET ROLE etsy_app');
  });

  afterAll(async () => {
    await admin.query('DELETE FROM users WHERE id = $1', [userId]);
    await Promise.all([admin.end(), runtime.end()]);
  });

  it('only exposes rows for the transaction tenant', async () => {
    await runtime.query('BEGIN');
    await runtime.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    await runtime.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantA]);
    const result = await runtime.query<{ tenant_id: string; object_key: string }>(
      'SELECT tenant_id, object_key FROM stored_objects',
    );
    await runtime.query('ROLLBACK');
    expect(result.rows).toEqual([{ tenant_id: tenantA, object_key: 'a.txt' }]);
  });

  it('rejects cross-tenant inserts even when the client supplies a tenant id', async () => {
    await runtime.query('BEGIN');
    await runtime.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    await runtime.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantA]);
    await expect(
      runtime.query(
        `INSERT INTO stored_objects(tenant_id,object_key,content_type,byte_size) VALUES ($1,'escape','text/plain',1)`,
        [tenantB],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await runtime.query('ROLLBACK');
  });
});
