#!/usr/bin/env sh
set -eu

env_file="${STAGING_ENV_FILE:-.env.staging}"
base_url="${STAGING_BASE_URL:-}"
cookie_jar="$(mktemp)"
response="$(mktemp)"
trap 'rm -f "$cookie_jar" "$response"' EXIT HUP INT TERM

STAGING_ENV_FILE="$env_file" "$(dirname "$0")/validate-env.sh"

if [ -z "$base_url" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a
  base_url="$WEB_ORIGIN"
fi

curl_flags="--fail --silent --show-error --max-time 20"
if [ "${CURL_INSECURE:-0}" = "1" ]; then
  curl_flags="$curl_flags --insecure"
fi

"$(dirname "$0")/verify.sh"

email="smoke-$(date +%s)-$$@example.invalid"
password="SmokeOnly-$(date +%s)-Aa9!"

# shellcheck disable=SC2086
curl $curl_flags -c "$cookie_jar" -H 'content-type: application/json' \
  --data "{\"firstName\":\"Staging\",\"lastName\":\"Smoke\",\"email\":\"$email\",\"password\":\"$password\",\"passwordConfirmation\":\"$password\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}" \
  "$base_url/api/auth/register" > "$response"
grep -q '"user"' "$response"

# Registration creates a session; log out before testing password login.
# shellcheck disable=SC2086
curl $curl_flags -b "$cookie_jar" -c "$cookie_jar" -X POST "$base_url/api/auth/logout" >/dev/null

# shellcheck disable=SC2086
curl $curl_flags -b "$cookie_jar" -c "$cookie_jar" -H 'content-type: application/json' \
  --data "{\"email\":\"$email\",\"password\":\"$password\"}" \
  "$base_url/api/auth/login" > "$response"
grep -q '"user"' "$response"

# shellcheck disable=SC2086
curl $curl_flags -b "$cookie_jar" -c "$cookie_jar" -X POST "$base_url/api/auth/logout" >/dev/null

echo "registration, login, logout, and infrastructure smoke tests passed"
