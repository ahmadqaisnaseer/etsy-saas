#!/usr/bin/env sh
set -eu

if git grep -nE -- '-----BEGIN (OPENSSH|RSA|EC|DSA|PRIVATE) KEY-----' -- .; then
  echo "private key material must not be committed" >&2
  exit 1
fi

if git grep -nE -- '(ETSY_API_KEY|ETSY_ACCESS_TOKEN|STRIPE_SECRET_KEY|OPENAI_API_KEY|VPS_HOST|SSH_PRIVATE_KEY)=[^[:space:]]+' -- ':!scripts/staging/check-scope.sh'; then
  echo "live integration or VPS credentials must not be committed" >&2
  exit 1
fi

if git grep -nE -- 'ETSY_INTEGRATION_ENABLED=(true|1)' -- ':!scripts/staging/check-scope.sh'; then
  echo "Etsy integration must remain disabled" >&2
  exit 1
fi

if git grep -nE -- '([0-9]{1,3}\.){3}[0-9]{1,3}' -- \
  '.github/workflows/staging-*.yml' '.env.staging.example' \
  'docker-compose.staging.yml' 'docker-compose.staging.https.yml.example' \
  'infrastructure/nginx/staging-*.conf.template'; then
  echo "literal IP addresses are not permitted in staging deployment configuration" >&2
  exit 1
fi

echo "secret and integration scope checks passed"
