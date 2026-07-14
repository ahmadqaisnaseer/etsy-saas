#!/usr/bin/env sh
set -eu

env_file="${STAGING_ENV_FILE:-.env.staging}"
backup_root="${BACKUP_ROOT:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$backup_root/$timestamp"

STAGING_ENV_FILE="$env_file" "$(dirname "$0")/validate-env.sh"
mkdir -p "$destination"

docker compose --env-file "$env_file" -f docker-compose.staging.yml \
  exec -T postgres sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U postgres -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$destination/postgres.dump"

sha256sum "$destination/postgres.dump" > "$destination/postgres.dump.sha256"
chmod 600 "$destination/postgres.dump" "$destination/postgres.dump.sha256"
echo "PostgreSQL backup created at $destination/postgres.dump"
