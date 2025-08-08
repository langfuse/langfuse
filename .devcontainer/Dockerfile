# Dev container Dockerfile
FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

# Install golang-migrate for database migrations
RUN curl -L https://github.com/golang-migrate/migrate/releases/download/v4.18.3/migrate.linux-amd64.tar.gz | tar xvz && \
    chmod +x migrate && \
    mv migrate /usr/local/bin/migrate

# Install pnpm globally
RUN npm install -g pnpm@9.5.0

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code
