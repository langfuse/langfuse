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

ARG NODE_VERSION=24.20.0

# Install the exact project runtime through the nvm environment provided by the
# universal devcontainer image, then move its shared `current` link to that version.
RUN bash -c 'source /usr/local/share/nvm/nvm.sh \
    && nvm install "${NODE_VERSION}" \
    && nvm alias default "${NODE_VERSION}" \
    && ln -sfn "/usr/local/share/nvm/versions/node/v${NODE_VERSION}" /usr/local/share/nvm/current \
    && test "$(node --version)" = "v${NODE_VERSION}"'

# Install golang-migrate for database migrations
COPY --from=migrate-builder /out/migrate /usr/local/bin/migrate

# Activate the repo's pinned pnpm via Corepack
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

# Install Clickhouse
RUN curl https://clickhouse.com/ | sh && \
    sudo ./clickhouse install

# Install agent CLIs used in this repo
RUN npm install -g @anthropic-ai/claude-code @openai/codex
