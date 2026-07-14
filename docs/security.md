# Security baseline

## Controls already enforced

- Forced PostgreSQL RLS on every tenant-owned table
- Separate migration and runtime database authorities
- Transaction-local tenant and user context (safe with connection pooling)
- Argon2id passwords, secret pepper, opaque hashed sessions, immediate revocation
- Secure/HttpOnly/SameSite cookies, origin checks, narrow CORS, security headers
- Per-IP global and authentication-specific rate limits
- One-megabyte JSON body limit and 15-second request deadline
- Redaction of cookie and authorization headers from logs
- Tenant-prefixed object keys and short-lived signed operations
- No Etsy OAuth endpoints, credentials, SDK, or outbound calls

## Deployment requirements

Terminate TLS at the load balancer, enforce HTTPS redirects and HSTS there, and rotate all example credentials. Store the password pepper and service credentials in a managed secret store. Use a managed KMS envelope key for any future third-party OAuth token. Restrict network egress by default and grant services only the destinations they require.

Backups must be encrypted, restore-tested, and retained according to policy. PostgreSQL audit records should be exported to append-only storage. Alert on readiness failures, authentication bursts, worker failure rates, and RLS authorization errors.

Before external availability, add email verification, password recovery with one-time hashed tokens, MFA for privileged roles, session/device management, invitation expiry, and a formal data-retention flow. Run dependency, container, SAST, DAST, and penetration testing.

## Etsy boundary

The `etsy_connections` table is a forward-compatible, tenant-scoped placeholder. It contains no credentials by default. Etsy work must begin with a separate threat model, OAuth state/PKCE design, least-scope review, encrypted token lifecycle, webhook signature validation, rate-limit strategy, sandbox testing, and explicit user authorization. None of that is active here.
