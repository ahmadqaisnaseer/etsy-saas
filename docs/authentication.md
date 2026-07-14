# Authentication and account management

Accounts use normalized, case-insensitively unique email addresses and Argon2id password hashes with the application pepper. Registration atomically creates a user, default workspace, and `owner` membership. The role foundation is `owner`, `admin`, and `member`; authorization is always evaluated server-side from authenticated membership, never from a browser-supplied tenant identifier.

## Verification and password recovery

New accounts may sign in but remain visibly unverified and must be restricted from future protected SaaS activity. Verification and password-reset links contain 256-bit random tokens. PostgreSQL stores only SHA-256 token hashes. Issuing a new token consumes prior live tokens; consumption is atomic, single-use, and expiry checked.

Development uses an in-memory email adapter so tests can inspect messages without a paid provider or outbound delivery. `EmailProvider` is the extension point for a future transactional provider. Never log message links or tokens.

## Sessions and request defense

Sessions are server-managed; only a hash of the opaque cookie value is stored. Cookies are HttpOnly, SameSite=Lax, scoped to `/`, and Secure in staging/production. Sign-in always creates fresh session material. Origin checks, narrow credentialed CORS, security headers, request limits, schema validation, and endpoint-specific rate limits protect cookie-authenticated writes.

Users can inspect safe device metadata, revoke their other sessions, or revoke all other sessions. Password reset revokes every session; password change retains only the current session. Session operations always constrain mutations by the authenticated user ID.

## Development

Copy `.env.example`, install from `pnpm-lock.yaml`, start PostgreSQL/Redis/MinIO, and run `pnpm db:migrate`. Authentication endpoints are exposed as `/api/auth/*` through Nginx and `/auth/*` directly by Fastify. Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm build`.

Future reviewed phases may add invitations, 2FA, social login, Stripe, and Etsy OAuth. None are enabled here.
