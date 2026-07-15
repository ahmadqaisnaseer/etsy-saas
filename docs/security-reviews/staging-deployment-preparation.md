# Security review: staging deployment preparation

## Scope

Reviewed the staging-only Compose topology, Nginx boundary, environment contract, migration control, backup procedures, smoke tests, and validation workflows. No deployment, external integration, live email provider, production change, or secret provisioning is included.

## Controls verified

- Only Nginx publishes host ports; PostgreSQL, Redis, MinIO, API, and worker stay on an internal network.
- Application and staging Nginx images use non-root users. Database, Redis, and MinIO use vendor images where changing users without a dedicated hardening exercise risks breaking volume ownership.
- Secure authentication cookies, explicit CORS origin, one trusted proxy hop, and trusted-host validation remain enforced.
- Application database access uses a no-login owner role plus a least-privilege login role; migrations require a separate administrator URL and explicit confirmation. Application storage uses a bucket-scoped identity rather than the MinIO root identity.
- Health checks, safe dependency ordering, persistent volumes, restart policies, resource limits, and bounded log rotation are configured.
- TLS configuration is ready for operator-mounted certificates; no certificate or private key is committed.
- The deployment workflow is inert behind an unconditional false guard and contains no VPS connectivity.
- Backups are checksummed and protected locally; restore is intentionally manual and approval-gated.
- Etsy remains disabled. No Stripe, billing, AI, VPS, production, or live email configuration was introduced.

## Residual risks and required approvals

Before deployment, Security must review the actual host hardening, firewall, DNS/Cloudflare settings, certificate lifecycle, secret manager, SSH host verification, backup encryption/retention, monitoring, and the separate workflow-enablement change. Staging migrations, infrastructure changes, DNS changes, secrets, and third-party enablement each require explicit human approval. Production deployment and production migration are never automatic.

Review outcome: approved for a draft staging-preparation pull request only; not approved for deployment.
