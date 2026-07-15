#!/bin/sh
set -eu

if [ -z "${APP_DATABASE_PASSWORD:-}" ]; then
  echo 'APP_DATABASE_PASSWORD is required' >&2
  exit 1
fi

psql --set=ON_ERROR_STOP=1 --set=app_password="$APP_DATABASE_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
SELECT 'CREATE ROLE etsy_app NOLOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'etsy_app')\gexec

SELECT format('CREATE ROLE app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app')\gexec

ALTER ROLE app PASSWORD :'app_password';
GRANT etsy_app TO app;
SQL
