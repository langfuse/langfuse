FROM node:20

# ---------- System packages --------------------------------------------------
# The buildpack-deps base already ships git, build-essential, python, etc.
# Add a few extra tools handy during Langfuse development.
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      openssl \
      wget \
      curl \
      ca-certificates \
      postgresql-client \
      redis-tools \
      less nano \
    && rm -rf /var/lib/apt/lists/*

# ---------- pnpm -------------------------------------------------------------
# Langfuse monorepo relies on pnpm 9.5.0 (see CONTRIBUTING.md)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && \
    corepack prepare pnpm@9.5.0 --activate

# ---------- golang-migrate ----------------------------------------------------
# CLI used for database migrations during development.
ENV MIGRATE_VERSION=4.18.2
RUN wget -qO- "https://github.com/golang-migrate/migrate/releases/download/v${MIGRATE_VERSION}/migrate.linux-amd64.tar.gz" \
    | tar -xz -C /usr/local/bin && \
    chmod +x /usr/local/bin/migrate

# ---------- Non-root user -----------------------------------------------------
# Use root for convenience in development containers
WORKDIR /workspace

# Create non-root user
RUN useradd -ms /bin/bash ubuntu

# Pre-create pnpm store and set correct ownership to avoid first-run cost & permission issues
RUN pnpm store path > /dev/null && \
    chown -R ubuntu:ubuntu /pnpm

USER ubuntu
WORKDIR /home/ubuntu
ENV HOME=/home/ubuntu

# Container starts with a bash shell ready for hacking.
CMD ["bash"]
