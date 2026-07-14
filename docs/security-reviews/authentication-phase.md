# Authentication phase security review

## Scope and trust boundaries

Reviewed registration, login/logout, email verification, password recovery, profile/password changes, server-managed sessions, workspace membership, roles, audit events, migration `0002_authentication.sql`, browser flows, and the development-only email adapter. Browser input is untrusted; Fastify owns authentication and tenant selection; PostgreSQL forced RLS is the tenant boundary. Etsy, billing, AI, deployment, and live email delivery remain disabled/out of scope.

## Controls verified

- Argon2id with the existing application pepper; minimum 12 characters, long passphrases allowed, common-password and email-equality checks at registration.
- 256-bit opaque session and action tokens; only SHA-256 digests are stored. Verification/reset consumption is atomic, expiring, and single-use.
- HttpOnly, SameSite=Lax cookies with Secure enabled in staging/production; fresh session material on login; immediate server-side revocation.
- Generic login and forgot-password responses, endpoint-specific rate limits, same-origin write defense, narrow credentialed CORS, security headers, request limits, and structured validation.
- Password reset revokes all sessions; password change requires the current password and retains only the current session.
- Session mutations include the authenticated user ID, so a session identifier alone cannot revoke another user's session.
- Registration creates user, workspace, owner membership, settings, and audit event atomically. Browser-supplied tenant IDs are not accepted by account routes.
- Security logs redact cookies, authorization, passwords, confirmation fields, and raw action tokens. Audit metadata contains no raw credentials or tokens.

## Tenant and database review

Tenant-owned records retain forced RLS and transaction-local user/tenant context. The new tenant-aware audit table has a forced-RLS policy and an integration test proving tenant A cannot read tenant B audit rows. Identity/session/token tables are global identity infrastructure because one user may belong to multiple workspaces; they are not exposed through generic tenant routes, and application mutations are user-scoped. Runtime remains a non-owner role.

## Findings and disposition

- No high or critical issue remains in the reviewed scope.
- Development email is intentionally in-memory and non-delivering. A real provider requires a separate approved integration and security review.
- Unverified users may sign in but receive a clear restriction notice; future protected SaaS endpoints must enforce verification server-side.
- Invitations, multi-workspace switching UI, 2FA, social login, email change, and production provider delivery are documented extension points, not partial implementations.

## Decision

Security Agent decision: **approve for draft pull request review**, contingent on all required CI, migration, and forced-RLS tests passing. This is not approval to merge, deploy, migrate staging/production, access secrets, or enable a provider.

## Rollback and containment

Before merge, reset or revert the feature branch. After a future approved merge, prefer a forward fix because the migration is additive; application rollback must retain compatibility with added nullable identity columns and new tables. For an authentication incident, revoke affected sessions/tokens, preserve audit evidence, disable affected routes at the application layer, and validate tenant isolation before restoration.
