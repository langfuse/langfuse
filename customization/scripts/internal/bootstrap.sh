#!/usr/bin/env bash

# ⚠️ MAINTAINER-ONLY SCRIPT
# This script is ONLY intended for the fork maintainer to set up the project.
# Teammates should never run this script.
# Instead, they should:
#    1. git clone https://github.com/your-username/langfuse-fork.git
#    2. cd langfuse-fork
#    3. make env && make up

# ---------------------------------------------
# Langfuse Fork Bootstrap Script
# Author: Carlos Crespo
# Description: Sets up fork from upstream, configures remotes,
# generates .env.local.example, and prepares customization onboarding.
# ---------------------------------------------

set -euo pipefail

# --- CONFIGURATION ---
UPSTREAM_REPO="https://github.com/langfuse/langfuse.git"
PERSONAL_REPO="git@github.com:macayaven/langfuse-fork.git"
TARGET_DIR="customization"
ENV_TEMPLATE_FILE=".env.local.example"

# --- STEP 0: Check Docker & Docker Compose ---
echo "🔍 Checking for Docker and Docker Compose..."
if ! command -v docker &>/dev/null; then
  echo "❌ Docker not found. Install Docker before continuing: https://docs.docker.com/get-docker/"
  exit 1
fi

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
  echo "🔧 Ensuring current user is in docker group..."
  sudo usermod -aG docker "$USER" || true
  echo "ℹ️  Log out and back in to apply docker group changes if needed."
fi

if ! docker compose version &>/dev/null; then
  echo "🔧 Docker Compose v2 not found. Installing to ~/.docker/cli-plugins..."
  mkdir -p "$HOME/.docker/cli-plugins"
  curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
    -o "$HOME/.docker/cli-plugins/docker-compose"
  chmod +x "$HOME/.docker/cli-plugins/docker-compose"
  echo "✅ Docker Compose installed locally."
else
  echo "✅ Docker Compose is available."
fi

# --- STEP 1: Clone Langfuse from upstream ---
echo "📥 Cloning upstream Langfuse..."
git clone "$UPSTREAM_REPO" "$TARGET_DIR"
cd "$TARGET_DIR"

# --- STEP 2: Configure remotes ---
echo "🔧 Setting 'origin' as your personal repo and 'upstream' as official Langfuse..."
git remote rename origin upstream

# Add your personal repo
git remote add origin "$PERSONAL_REPO"

# Make origin the default for push/pull
git remote set-url origin "$PERSONAL_REPO"
git remote set-url --push origin "$PERSONAL_REPO"
git branch --set-upstream-to=origin/main main || git branch --set-upstream-to=origin/master master

# Prevent accidental pushes to upstream
git remote set-url --push upstream no_push

# --- STEP 3: Push to personal GitHub repo ---
echo "🚀 Pushing code to your personal fork..."
git push -u origin main || git push -u origin master

# --- STEP 4: Generate .env.local.example with placeholders ---
echo "📝 Creating .env.local.example..."
cat >"$ENV_TEMPLATE_FILE" <<EOF
DATABASE_URL=postgresql://postgres:yourpassword@postgres:5432/postgres
CLICKHOUSE_PASSWORD=your-clickhouse-password
LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY=your-minio-secret
LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY=your-minio-secret
LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY=your-minio-secret
REDIS_AUTH=your-redis-password
NEXTAUTH_SECRET=your-random-nextauth-secret
EOF

echo "✅ .env.local.example created."

# --- STEP 5: Copy override file if present ---
OVERRIDE_SOURCE_PATH="$(dirname "$0")/../docker-compose.override.yml"
if [ -f "$OVERRIDE_SOURCE_PATH" ]; then
  echo "📦 Copying docker-compose.override.yml into project root..."
  cp "$OVERRIDE_SOURCE_PATH" .
fi

echo "🎉 Bootstrap complete."
echo "👉 Next steps:"
echo "   1. cd $TARGET_DIR"
echo "   2. make env"
echo "   3. make up"
echo "   4. make health"
echo "🤝 Optional steps:"
echo "   5. make check"
echo "   6. make update"
