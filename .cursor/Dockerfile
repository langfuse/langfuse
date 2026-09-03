FROM --platform=${BUILDPLATFORM} golang:1.24 AS migrate-builder

ARG TARGETOS
ARG TARGETARCH
ENV CGO_ENABLED=0 \
    GOBIN=/out \
    GOOS=${TARGETOS} \
    GOARCH=${TARGETARCH}

RUN /usr/local/go/bin/go install -trimpath -tags 'clickhouse' -ldflags='-s -w' \
    github.com/golang-migrate/migrate/v4/cmd/migrate@v4.19.1

FROM ubuntu:24.04

ARG DOCKER_VERSION=5:28.5.2-1~ubuntu.24.04~noble
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      git \
      gh \
      gnupg \
      iptables \
      jq \
      openssh-client \
      python3 \
      sudo \
      unzip \
      wget \
      fuse-overlayfs \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 24 from NodeSource and activate the repository's pinned pnpm.
# Pass --build-arg NODE_USE_ENV_PROXY=1 when building behind a proxy.
ARG NODE_USE_ENV_PROXY
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl --retry 3 --retry-delay 5 -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install --global corepack@0.36.0 \
    && corepack enable \
    && corepack prepare pnpm@11.22.0 --activate \
    && rm -rf /var/lib/apt/lists/*

# Cursor Cloud runs Docker inside its own container layer. fuse-overlayfs and
# legacy iptables avoid the common nested-Docker storage and networking faults.
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl --retry 3 --retry-delay 5 -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" \
      > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
      docker-ce=${DOCKER_VERSION} \
      docker-ce-cli=${DOCKER_VERSION} \
      containerd.io \
      docker-buildx-plugin \
      docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/docker \
    && printf '%s\n' '{' '  "storage-driver": "fuse-overlayfs"' '}' > /etc/docker/daemon.json \
    && update-alternatives --set iptables /usr/sbin/iptables-legacy \
    && update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy

# /run (and the /var/run symlink target) can land mode 0700 in nested Docker
# VMs. Keep the directory searchable so the docker-group ubuntu user can reach
# docker.sock. start-cursor-cloud.sh also repairs this at runtime after
# `service docker start`, which may recreate a private /var/run.
RUN chmod 755 /run /var/run 2>/dev/null || true

RUN id -u ubuntu >/dev/null 2>&1 || useradd -m -s /bin/bash ubuntu \
    && groupadd -f docker \
    && usermod -aG docker,sudo ubuntu \
    && echo "ubuntu ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu

COPY --from=migrate-builder /out/migrate /usr/local/bin/migrate
COPY scripts/agents/clickhouse-client.sh /usr/local/bin/clickhouse
RUN chmod 0755 /usr/local/bin/migrate /usr/local/bin/clickhouse

USER ubuntu
WORKDIR /home/ubuntu
