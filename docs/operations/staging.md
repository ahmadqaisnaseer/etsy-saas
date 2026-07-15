# Staging deployment runbook

## Status and approval boundary

This repository prepares a staging deployment but does not deploy it. The manual GitHub Actions template is deliberately disabled, contains no VPS access, and cannot deploy. Enabling infrastructure, DNS, secrets, certificates, migrations, or a deployment requires explicit human approval plus DevOps and Release Manager review. Security must review any change to the network, proxy, credentials, or authentication settings.

Production deployment is out of scope and prohibited by `agent-policy.json`.

## Host baseline

Use Ubuntu Server 24.04 LTS on a supported VPS. Install Docker Engine from Docker's official apt repository, the Docker Compose v2 plugin, Git, curl, ca-certificates, and a host firewall such as UFW. Enable automatic security updates. `fail2ban` is recommended when SSH is exposed.

Size the first staging host at a minimum of 4 vCPU, 8 GiB RAM, and 80 GiB encrypted SSD, then adjust from observed metrics. The Compose file records conservative CPU and memory limits for every long-running service; Docker's `deploy.resources` limits are honored by modern Compose even outside Swarm. Keep at least twice the active database and object-storage footprint free for backups and upgrades.

## Network, firewall, and DNS preparation

Only Nginx publishes host ports. PostgreSQL, Redis, MinIO, the API, and the worker use an internal Docker network and must never receive host port mappings.

Allow inbound TCP 80 and 443. Restrict TCP 22 to approved administrator source networks or a VPN. Deny all other unsolicited inbound traffic. Outbound access should be limited according to the host provider's capabilities; no Etsy, Stripe, AI, or live email endpoint is required.

Reserve a staging subdomain such as `staging.example.invalid`; replace the reserved example only during the approved infrastructure change. In Cloudflare, create the staging DNS record after the VPS address is approved, use Full (strict) TLS once an origin certificate exists, enable authenticated administrative access where appropriate, and do not cache `/api/*` or `/health/*`. DNS and Cloudflare changes require human approval.

## Secrets required later

Copy `.env.staging.example` to a host-only `.env.staging` file with mode `0600`. Generate unique high-entropy, URL-safe values on the host or in the approved secret manager for:

- PostgreSQL administrator password
- least-privilege application database password
- password pepper
- MinIO root bootstrap credentials plus a separate least-privilege application storage access identifier and secret
- VPS SSH deployment credential and host fingerprint, only if the disabled workflow is later approved
- TLS certificate and private key, stored outside Git and mounted read-only

Never commit the resulting file, certificates, passwords, tokens, IP addresses, SSH keys, or live domain details. GitHub environment secrets may be added only after human approval. Do not reuse production credentials.

## Configuration model

`docker-compose.staging.yml` runs web, API, worker, PostgreSQL, Redis, and MinIO as separate services. Only the web/Nginx service publishes port 80. Named volumes persist database, Redis, and object storage data. Health checks and dependency conditions prevent application startup before dependencies are ready. Restart policies, bounded JSON log rotation, and resource limits are included.

`docker-compose.staging.https.yml.example` is an opt-in overlay. It mounts an operator-provisioned certificate directory read-only and exposes port 443. The HTTP-only configuration is for preparation and certificate bootstrap; do not expose credentials or accept user traffic until HTTPS is active.

The API trusts exactly one reverse-proxy hop in staging and production. Its configured web origin defines CORS and the accepted host. Authentication cookies remain secure, HTTP-only, and same-site. Do not weaken these controls to work around proxy configuration.

Validate before every operation:

```sh
STAGING_ENV_FILE=.env.staging scripts/staging/validate-env.sh
docker compose --env-file .env.staging -f docker-compose.staging.yml config --quiet
```

## First deployment checklist

After VPS, DNS, secret, and staging deployment approvals are recorded:

1. Harden and patch the Ubuntu host; configure firewall and restricted SSH.
2. Install the required packages and clone the reviewed commit on `agent/add-staging-deployment` or its approved successor.
3. Create the host-only `.env.staging` and TLS directory; keep the environment file at `0600`, the directory at `0750`, the certificate at `0644`, and the private key at `0640` owned by the mapped unprivileged Nginx user/group.
4. Run environment, Compose, shell, image-build, and Nginx validation.
5. Start only PostgreSQL, Redis, and MinIO; confirm their health.
6. Review the exact migration plan and take fresh database and storage backups.
7. Run the controlled migration command with explicit confirmation.
8. Start the API, worker, web, and HTTPS overlay; wait for all health checks.
9. Run verification and smoke tests, then review logs and authentication audit events.

These are manual steps; this change does not perform them.

## Migrations

Migrations never run automatically with API startup. Review migration SQL for destructive operations, tenant isolation, and rollback implications. After approval and a fresh backup, run:

```sh
CONFIRM_STAGING_MIGRATION=yes STAGING_ENV_FILE=.env.staging scripts/staging/migrate.sh
```

The migration job uses `DATABASE_ADMIN_URL`; application services use the least-privilege `DATABASE_URL`. A staging migration requires explicit human approval under the repository policy. Never point either URL at production.

## Backups

Run both scripts from the repository root before migrations and releases:

```sh
BACKUP_ROOT=/srv/etsy-saas/backups STAGING_ENV_FILE=.env.staging scripts/staging/backup-postgres.sh
BACKUP_ROOT=/srv/etsy-saas/backups STAGING_ENV_FILE=.env.staging scripts/staging/backup-storage.sh
```

The database dump uses PostgreSQL custom format. Storage is mirrored with MinIO Client. The scripts create SHA-256 manifests and restrict local permissions. Copy backups to an encrypted, access-controlled, off-host destination, apply retention, and test restores regularly. Do not commit backups.

## Restore

Restores overwrite staging data and require human approval, a maintenance window, a second backup, and confirmation that every URL targets staging. Stop API and worker writes first. Verify the selected checksum, restore the database into a newly created empty staging database with `pg_restore --no-owner --no-acl`, mirror storage into a new empty bucket, run migration status checks, then restart and verify. Prefer restoring to new volumes and switching only after validation; retain the previous volumes until acceptance.

Never use an automated destructive restore command. Document the backup timestamp, reviewer, commands, checksums, and verification outcome in the incident or change record.

## Verification and smoke tests

After an approved start:

```sh
STAGING_ENV_FILE=.env.staging scripts/staging/verify.sh
STAGING_ENV_FILE=.env.staging scripts/staging/smoke.sh
```

Verification covers public liveness/readiness plus PostgreSQL, Redis, worker, storage, and `nginx -t`. Smoke testing creates an `example.invalid` account and exercises registration, logout, login, and logout again. Remove smoke accounts according to the approved staging-data retention process; do not run the smoke script against production.

## Rollback

Before every release, record the current commit and image digests. If verification fails:

1. Stop ingress or place staging in maintenance mode.
2. Preserve logs, service state, and audit events.
3. Stop API and worker writes.
4. Check out the previously recorded reviewed commit and rebuild or pull its pinned images.
5. If the schema is backward compatible, restart the prior application version without changing data.
6. If data restoration is required, obtain explicit approval and follow the restore procedure into new volumes.
7. Re-run health, tenant-isolation, authentication, and smoke checks before reopening ingress.

Do not reverse a destructive migration ad hoc. Escalate to the Database, Security, DevOps, and Release Manager agents and the human approver.

## Incident response

For suspected compromise, credential disclosure, data corruption, or tenant-isolation failure: restrict ingress, preserve evidence, stop writes if needed, notify the human incident owner, rotate affected staging credentials, and invalidate sessions. Do not delete logs or data. Record timeline, scope, indicators, decisions, rollback/restore actions, and verification. Production remains untouched. Complete a Security review and post-incident action plan before staging is reopened.

## Remaining go-live gates

Staging remains blocked until a human approves and supplies the VPS, hardened host, firewall, staging DNS/Cloudflare record, origin certificate, host-only secrets, protected GitHub `staging` environment, backup destination, monitoring/alerting, and a reviewed enablement change for the disabled deployment workflow. DevOps, Security, QA, Documentation, and Release Manager reviews are required.
