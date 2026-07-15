# Etsy SaaS foundation

Production-oriented starting point for a multi-tenant commerce SaaS. This repository does **not** connect to Etsy, request Etsy credentials, or modify any store. The environment contract only accepts `ETSY_INTEGRATION_ENABLED=false`.

## What is included

- React 19 + TypeScript web application
- Fastify API with secure, server-side cookie sessions
- Argon2id password hashing with an application pepper
- PostgreSQL schema with forced row-level security (RLS)
- Redis/BullMQ worker with retries and graceful shutdown
- S3-compatible object storage and short-lived upload URL support
- Liveness and dependency-aware readiness checks
- Unit, HTTP, UI, and PostgreSQL isolation tests
- Reproducible Docker Compose stack and multi-stage images
- Explicit development, staging, and production environment templates
- CI checks for formatting, linting, types, tests, migration, and image build

See [docs/architecture.md](docs/architecture.md) for the system boundaries and [docs/security.md](docs/security.md) for the security model.

## Local development

Requirements: Node.js 22+, pnpm 10+, and Docker with Compose.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev:infra
pnpm db:migrate
pnpm dev
```

Open `http://localhost:5173`. MinIO's local console is at `http://localhost:9001`.

For the fully containerized stack:

```bash
docker compose up --build
```

Open `http://localhost:8080`.

## Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration   # needs DATABASE_ADMIN_URL and an applied schema
pnpm build
```

## Environment promotion

`.env.development`, `.env.staging`, and `.env.production` contain non-secret policy defaults. Never commit runtime secrets. Inject database credentials, Redis URLs, the password pepper, and object-storage credentials from the target platform's secret manager. Promote the same tested image digest from staging to production; do not rebuild per environment.

Database migrations run as a separate release task with `DATABASE_ADMIN_URL`. The API and worker use a restricted login that is a member of the `etsy_app` role. Production must not use a database owner or superuser as the runtime login because those roles may bypass RLS.

## Repository map

```text
apps/
  api/                 HTTP API, auth, tenant transactions, readiness
  web/                 React application shell
  worker/              Background job consumers
packages/shared/       Validated environment and shared API types
database/migrations/   Versioned PostgreSQL schema and RLS policies
infrastructure/        Local database bootstrap and nginx config
scripts/               Operational scripts
docs/                  Architecture and security decisions
```

## Deliberate next steps

Email verification, password reset, MFA, organization invitations, billing, and observability exporters should be implemented before public launch. Etsy OAuth must be a separate, reviewed milestone; the existing `etsy_connections` table is inert schema only and should store encrypted tokens through a managed KMS when that milestone begins.

## Authentication and accounts

The account phase provides registration, email verification through the development email adapter, login/logout, password recovery, profile/password management, safe session revocation, default workspace ownership, owner/admin/member roles, and structured security audit events. See [docs/authentication.md](docs/authentication.md) for behavior, configuration, migrations, testing, and extension points.

## Staging deployment preparation

Phase 3 adds a staging-only Compose topology, HTTPS-ready Nginx configuration, controlled migrations, backup tooling, smoke tests, and non-deploying GitHub validation. No VPS, live secret, certificate, or external integration is connected. See [the staging runbook](docs/operations/staging.md) before any approved infrastructure work.
