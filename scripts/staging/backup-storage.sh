#!/usr/bin/env sh
set -eu

env_file="${STAGING_ENV_FILE:-.env.staging}"
backup_root="${BACKUP_ROOT:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="$backup_root/$timestamp/storage"

STAGING_ENV_FILE="$env_file" "$(dirname "$0")/validate-env.sh"
mkdir -p "$destination"
absolute_destination="$(cd "$destination" && pwd)"

docker compose --env-file "$env_file" -f docker-compose.staging.yml \
  --profile operations run --rm -T \
  -v "$absolute_destination:/backup" storage-client \
  sh -ec 'mc alias set staging http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror --overwrite staging/"$S3_BUCKET" /backup'

find "$destination" -type f -exec sha256sum {} \; > "$destination.sha256"
chmod -R go-rwx "$destination" "$destination.sha256"
echo "Application storage backup created at $destination"
