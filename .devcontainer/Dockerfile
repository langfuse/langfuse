# Dev container Dockerfile
FROM mcr.microsoft.com/devcontainers/universal:2

# Install golang-migrate for database migrations
RUN curl -L https://github.com/golang-migrate/migrate/releases/download/v4.19.1/migrate.linux-amd64.tar.gz | tar xvz && \
    chmod +x migrate && \
    mv migrate /usr/local/bin/migrate

# Activate the repo's pinned pnpm via Corepack
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Install Clickhouse
RUN curl https://clickhouse.com/ | sh && \
    sudo ./clickhouse install

# Install agent CLIs used in this repo
RUN npm install -g @anthropic-ai/claude-code @openai/codex
