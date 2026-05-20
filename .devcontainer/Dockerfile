# Dev container Dockerfile
FROM --platform=${BUILDPLATFORM} golang:1.24 AS migrate-builder
ARG TARGETOS
ARG TARGETARCH
# GOBIN must NOT be set when cross-compiling — Go refuses it.
ENV CGO_ENABLED=0 \
    GOOS=${TARGETOS} \
    GOARCH=${TARGETARCH}
# Build only the ClickHouse migrate CLI used in this repo.
RUN go install -trimpath -tags 'clickhouse' -ldflags='-s -w' \
        github.com/golang-migrate/migrate/v4/cmd/migrate@v4.19.1 && \
    mkdir -p /out && \
    (cp "$(go env GOPATH)/bin/${GOOS}_${GOARCH}/migrate" /out/migrate 2>/dev/null || \
     cp "$(go env GOPATH)/bin/migrate" /out/migrate)

FROM mcr.microsoft.com/devcontainers/universal:2

# Install golang-migrate for database migrations
COPY --from=migrate-builder /out/migrate /usr/local/bin/migrate

# Activate the repo's pinned pnpm via Corepack
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

# Install Clickhouse
RUN curl https://clickhouse.com/ | sh && \
    sudo ./clickhouse install

# Install agent CLIs used in this repo
RUN npm install -g @anthropic-ai/claude-code @openai/codex
