#!/usr/bin/env sh
set -eu

env_file="${STAGING_ENV_FILE:-.env.staging}"

if [ "${CONFIRM_STAGING_MIGRATION:-}" != "yes" ]; then
  echo "Refusing to migrate. Set CONFIRM_STAGING_MIGRATION=yes after reviewing the migration." >&2
  exit 1
fi

STAGING_ENV_FILE="$env_file" "$(dirname "$0")/validate-env.sh"

docker compose --env-file "$env_file" \
  -f docker-compose.staging.yml \
  --profile operations run --rm migrate
