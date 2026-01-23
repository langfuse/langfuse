# Dev container Dockerfile
FROM mcr.microsoft.com/vscode/devcontainers/typescript-node:20-bookworm

# Install golang-migrate for database migrations
RUN curl -L https://github.com/golang-migrate/migrate/releases/download/v4.19.1/migrate.linux-amd64.tar.gz | tar xvz && \
    chmod +x migrate && \
    mv migrate /usr/local/bin/migrate

# Install pnpm globally
RUN npm install -g pnpm@9.5.0

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code
