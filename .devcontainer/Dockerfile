# Dev container Dockerfile
FROM --platform=${BUILDPLATFORM} golang:1.24 AS migrate-builder
ARG TARGETOS
ARG TARGETARCH
ENV CGO_ENABLED=0 \
    GOBIN=/out \
    GOOS=${TARGETOS} \
    GOARCH=${TARGETARCH}
# Build only the ClickHouse migrate CLI used in this repo.
RUN /usr/local/go/bin/go install -trimpath -tags 'clickhouse' -ldflags='-s -w' \
    github.com/golang-migrate/migrate/v4/cmd/migrate@v4.19.1

FROM mcr.microsoft.com/devcontainers/universal:2

# Install golang-migrate for database migrations
COPY --from=migrate-builder /out/migrate /usr/local/bin/migrate

# Activate the repo's pinned pnpm via Corepack
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Install Clickhouse
RUN curl https://clickhouse.com/ | sh && \
    sudo ./clickhouse install

# Install agent CLIs used in this repo
RUN npm install -g @anthropic-ai/claude-code @openai/codex
