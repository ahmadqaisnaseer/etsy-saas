ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text;
UPDATE users SET first_name = split_part(display_name, ' ', 1), last_name = NULLIF(substr(display_name, length(split_part(display_name, ' ', 1)) + 2), '') WHERE first_name IS NULL;
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner', 'admin', 'member'));

CREATE TABLE email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE, expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_tokens_user_idx ON email_verification_tokens(user_id, expires_at);
CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE, expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens(user_id, expires_at);
CREATE TABLE security_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL, event_name text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_audit_events_tenant_time_idx ON security_audit_events(tenant_id, occurred_at DESC);
CREATE INDEX security_audit_events_actor_time_idx ON security_audit_events(actor_user_id, occurred_at DESC);
ALTER TABLE security_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY security_audit_tenant_isolation ON security_audit_events USING (tenant_id IS NULL OR tenant_id = app_tenant_id()) WITH CHECK (tenant_id IS NULL OR tenant_id = app_tenant_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON email_verification_tokens, password_reset_tokens, security_audit_events TO etsy_app;
