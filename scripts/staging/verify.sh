#!/usr/bin/env sh
set -eu

env_file="${STAGING_ENV_FILE:-.env.staging}"
base_url="${STAGING_BASE_URL:-}"
curl_flags="--fail --silent --show-error --max-time 15"

STAGING_ENV_FILE="$env_file" "$(dirname "$0")/validate-env.sh"

if [ -z "$base_url" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
  base_url="$WEB_ORIGIN"
fi

if [ "${CURL_INSECURE:-0}" = "1" ]; then
  curl_flags="$curl_flags --insecure"
fi

# shellcheck disable=SC2086
curl $curl_flags "$base_url/health/live" | grep -q '"status":"ok"'
# shellcheck disable=SC2086
curl $curl_flags "$base_url/health/ready" | grep -q '"status":"ok"'

dc() {
  docker compose --env-file "$env_file" -f docker-compose.staging.yml "$@"
}

dc exec -T postgres pg_isready -U postgres -d etsy_saas >/dev/null
dc exec -T redis redis-cli ping | grep -q PONG
dc exec -T minio curl --fail --silent http://localhost:9000/minio/health/ready >/dev/null
dc exec -T worker node -e 'process.kill(1, 0)'
dc exec -T web nginx -t

echo "staging service verification passed"
