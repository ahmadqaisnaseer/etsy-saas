#!/usr/bin/env sh
set -eu

env_file="${STAGING_ENV_FILE:-.env.staging}"

case "$env_file" in
  */*) ;;
  *) env_file="./$env_file" ;;
esac

if [ ! -r "$env_file" ]; then
  echo "staging environment file is not readable: $env_file" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

required="STAGING_SERVER_NAME WEB_ORIGIN APP_BASE_URL POSTGRES_PASSWORD APP_DATABASE_PASSWORD DATABASE_URL DATABASE_ADMIN_URL PASSWORD_PEPPER MINIO_ROOT_USER MINIO_ROOT_PASSWORD S3_ACCESS_KEY S3_SECRET_KEY S3_BUCKET"
for name in $required; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "$name must be set" >&2
    exit 1
  fi
done

[ "${APP_ENV:-}" = "staging" ] || { echo "APP_ENV must be staging" >&2; exit 1; }
[ "${ETSY_INTEGRATION_ENABLED:-false}" = "false" ] || { echo "Etsy integration must remain disabled" >&2; exit 1; }
[ "$S3_BUCKET" = "etsy-saas-staging" ] || { echo "S3_BUCKET must be the staging-only bucket" >&2; exit 1; }

case "$WEB_ORIGIN" in
  https://"$STAGING_SERVER_NAME") ;;
  *) echo "WEB_ORIGIN must be https://STAGING_SERVER_NAME" >&2; exit 1 ;;
esac

[ "$APP_BASE_URL" = "$WEB_ORIGIN" ] || { echo "APP_BASE_URL must equal WEB_ORIGIN" >&2; exit 1; }
[ "${#POSTGRES_PASSWORD}" -ge 24 ] || { echo "POSTGRES_PASSWORD must be at least 24 characters" >&2; exit 1; }
[ "${#APP_DATABASE_PASSWORD}" -ge 24 ] || { echo "APP_DATABASE_PASSWORD must be at least 24 characters" >&2; exit 1; }
[ "${#PASSWORD_PEPPER}" -ge 32 ] || { echo "PASSWORD_PEPPER must be at least 32 characters" >&2; exit 1; }
[ "${#MINIO_ROOT_USER}" -ge 3 ] || { echo "MINIO_ROOT_USER must be at least 3 characters" >&2; exit 1; }
[ "${#MINIO_ROOT_PASSWORD}" -ge 24 ] || { echo "MINIO_ROOT_PASSWORD must be at least 24 characters" >&2; exit 1; }
[ "${#S3_ACCESS_KEY}" -ge 3 ] || { echo "S3_ACCESS_KEY must be at least 3 characters" >&2; exit 1; }
[ "${#S3_SECRET_KEY}" -ge 24 ] || { echo "S3_SECRET_KEY must be at least 24 characters" >&2; exit 1; }
[ "$MINIO_ROOT_USER" != "$S3_ACCESS_KEY" ] || { echo "application storage access must not use the MinIO root identity" >&2; exit 1; }

case "$DATABASE_URL" in
  postgresql://app:*@postgres:5432/*) ;;
  *) echo "DATABASE_URL must use the least-privilege app role on the internal postgres service" >&2; exit 1 ;;
esac

case "$DATABASE_ADMIN_URL" in
  postgresql://postgres:*@postgres:5432/*) ;;
  *) echo "DATABASE_ADMIN_URL must use the internal postgres service" >&2; exit 1 ;;
esac

echo "staging environment is valid"
