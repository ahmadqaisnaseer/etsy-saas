import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.DATABASE_ADMIN_URL;
const suite = connectionString ? describe : describe.skip;

suite('authentication tenant isolation', () => {
  const admin = new pg.Client({ connectionString });
  const runtime = new pg.Client({ connectionString });
  const userA = randomUUID();
  const userB = randomUUID();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  beforeAll(async () => {
    await Promise.all([admin.connect(), runtime.connect()]);
    await admin.query(
      `INSERT INTO users(id,email,password_hash,display_name,first_name,last_name) VALUES($1,$2,'hash','A','A','User'),($3,$4,'hash','B','B','User')`,
      [userA, `${userA}@example.com`, userB, `${userB}@example.com`],
    );
    await admin.query(`INSERT INTO tenants(id,name,slug) VALUES($1,'A',$2),($3,'B',$4)`, [
      tenantA,
      `a-${tenantA}`,
      tenantB,
      `b-${tenantB}`,
    ]);
    await admin.query(
      `INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'owner'),($3,$4,'member')`,
      [tenantA, userA, tenantB, userB],
    );
    await admin.query(
      `INSERT INTO security_audit_events(tenant_id,actor_user_id,event_name) VALUES($1,$2,'auth.login.succeeded'),($3,$4,'auth.login.succeeded')`,
      [tenantA, userA, tenantB, userB],
    );
    await runtime.query('SET ROLE etsy_app');
  });
  afterAll(async () => {
    await admin.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[userA, userB]]);
    await Promise.all([admin.end(), runtime.end()]);
  });
  it('only exposes the active tenant audit events', async () => {
    await runtime.query('BEGIN');
    await runtime.query("SELECT set_config('app.current_user_id',$1,true)", [userA]);
    await runtime.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantA]);
    const result = await runtime.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM security_audit_events',
    );
    await runtime.query('ROLLBACK');
    expect(result.rows).toEqual([{ tenant_id: tenantA }]);
  });
});
