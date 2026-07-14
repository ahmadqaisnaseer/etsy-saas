# Release handoff: staging deployment preparation

## Deliverable

Staging runtime definitions, an HTTPS-ready Nginx boundary, controlled migrations, environment validation, backups, restore/rollback guidance, smoke tests, and CI-only deployment validation are prepared. The existing CI workflow is unchanged. The manual deployment workflow is disabled and no VPS operation is performed.

## Required evidence

The draft pull request must show frozen-lockfile installation, formatting, lint, type checking, unit/UI tests, migration validation, PostgreSQL/RLS integration tests, production build, Docker image/Compose validation, Nginx validation, shell validation, staging smoke tests, and secret/integration scope checks.

## Release decision

No-go for deployment. A later change needs human infrastructure and staging-deployment approval, protected environment reviewers, VPS and DNS readiness, host-only secrets, certificates, backup destination, monitoring, and DevOps/Security/QA/Release Manager sign-off. Production deployment is explicitly outside this release.

## Rollback expectation

Record the previously accepted commit and image digests before any future staging release. Preserve old volumes until post-release verification passes. Roll back application code first when schemas remain compatible; any data restore is destructive, manual, and separately approved. Follow `docs/operations/staging.md` and attach verification evidence to the release record.
