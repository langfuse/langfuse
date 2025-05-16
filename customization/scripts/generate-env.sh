#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env"

if [ -f "$ENV_FILE" ]; then
  echo "⚠️  $ENV_FILE already exists. Aborting to avoid overwriting."
  exit 1
fi

cp .env.local.example "$ENV_FILE"

# Generate a secure random secret for NEXTAUTH_SECRET
NEW_SECRET=$(openssl rand -base64 32 | tr -d '\n')
sed -i.bak "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$NEW_SECRET|" "$ENV_FILE"
rm -f "$ENV_FILE.bak"

echo "✅ $ENV_FILE created from .env.local.example with secure NEXTAUTH_SECRET."
