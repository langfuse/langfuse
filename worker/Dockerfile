# Standard image: Alpine with the distribution's nodejs package, built on Iron
# Bank's hardened Alpine for releases and Langfuse Cloud. It does not support
# FIPS mode: the -fips image variant (Dockerfile.fips, UBI 9) is the one that
# runs on RHEL's CMVP-validated OpenSSL module.
# The default is the public Alpine image, so the build needs no credentials.
# Iron Bank serves Alpine from an authenticated registry with DoD provenance
# and scan attestations. Release builds opt in after `docker login
# registry1.dso.mil` (free P1 account plus a CLI secret):
#   --build-arg BASE_IMAGE=registry1.dso.mil/ironbank/opensource/alpinelinux/alpine:3.24
ARG BASE_IMAGE=alpine:3.24

FROM --platform=${TARGETPLATFORM:-linux/amd64} ${BASE_IMAGE} AS base

# Iron Bank's Alpine activates its OpenSSL FIPS provider in the system
# openssl.cnf; restore the stock file so this image uses OpenSSL's default
# providers on either base.
# icu-data-full is required: Alpine's Node uses the system ICU, whose default
# data package only covers English, and V8 segfaults in Intl.Segmenter (used
# e.g. by the prisma CLI's output formatting) without the full ICU data.
RUN apk upgrade --no-cache && \
    apk add --no-cache nodejs npm icu-data-full && \
    cp /etc/ssl/openssl.cnf.dist /etc/ssl/openssl.cnf && \
    rm -f /etc/ssl/*.apk-new

FROM --platform=${TARGETPLATFORM:-linux/amd64} base AS build-base
# Pin turbo to avoid nondeterministic prune output from future patch releases.
# pnpm is installed pinned via npm instead of corepack: the corepack shim would
# fetch pnpm from an unpinned CDN on first use.
RUN npm install -g turbo@2.11.6 pnpm@12.8.2
# Pass --build-arg NODE_USE_ENV_PROXY=1 when building behind a proxy.
ARG NODE_USE_ENV_PROXY

# The runtime image carries no package manager, python, or curl: apk-tools is
# removed after the install below, and its database stays for scanners.
FROM --platform=${TARGETPLATFORM:-linux/amd64} ${BASE_IMAGE} AS runtime-base

ARG UID=1001
ARG GID=1001

# icu-data-full and the openssl.cnf reset: see the base stage. tzdata provides
# the zoneinfo for TZ. dumb-init preserves the semver-covered ENTRYPOINT
# contract. busybox (in the base) provides the shell, and its wget keeps
# exec-style container health checks working (e.g. `wget --spider
# http://127.0.0.1:<port>/...` in ECS task definitions). Probe 127.0.0.1, not
# localhost: busybox wget only tries the first address localhost resolves to,
# which is ::1, and the server listens on IPv4.
RUN apk upgrade --no-cache && \
    apk add --no-cache nodejs icu-data-full tzdata ca-certificates dumb-init && \
    cp /etc/ssl/openssl.cnf.dist /etc/ssl/openssl.cnf && \
    rm -f /etc/ssl/*.apk-new && \
    addgroup -S -g "${GID}" expressjs && \
    adduser -S -D -H -u "${UID}" -G expressjs -h /home/expressjs -s /sbin/nologin expressjs && \
    apk del --no-cache apk-tools

FROM --platform=${TARGETPLATFORM:-linux/amd64} build-base AS pruner

WORKDIR /app

COPY . .
RUN turbo prune worker --docker

# Alpine build toolchain: Alpine's Node, pnpm, turbo, gcc and Rust.
FROM --platform=${TARGETPLATFORM:-linux/amd64} build-base AS toolchain

ARG TARGETARCH

# @langfuse/native is a Rust addon (napi-rs) compiled by `turbo run build` for
# the musl (`*-unknown-linux-musl`) target, so it loads in the runtime image.
# gcc and musl-dev provide the linker and C runtime objects; bash runs the
# toolchain installer; curl and patch prepare the small clickhouse source
# overlay used by the native encoder.
RUN apk add --no-cache gcc musl-dev bash curl patch

# rustc's musl targets default to a `<arch>-linux-musl-gcc` linker name that
# Alpine does not ship; its gcc is reachable as `cc`.
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_MUSL_LINKER=cc CARGO_TARGET_X86_64_UNKNOWN_LINUX_MUSL_LINKER=cc

# Pinned standalone Rust installer, the exact channel from
# packages/native/rust-toolchain.toml (bump it together with Dockerfile.fips),
# checksum-verified. Only rustc, cargo and the target's std are needed to
# build; clippy and rustfmt run outside Docker.
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
    amd64) triple=x86_64-unknown-linux-musl; toolchain_sha256=b2cf07e41d4747ddf3b20962ca9de2a08da00646f55ab4c1b51cef99895bae0a ;; \
    arm64) triple=aarch64-unknown-linux-musl; toolchain_sha256=c26e37bb6f20e49498c552e53e3f34871ba2f7610c7f8b2cce38a48e3570c7de ;; \
    *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/rust.tar.gz "https://static.rust-lang.org/dist/rust-1.98.0-${triple}.tar.gz"; \
    echo "${toolchain_sha256}  /tmp/rust.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/rust.tar.gz -C /tmp; \
    /tmp/rust-1.98.0-${triple}/install.sh --prefix=/usr/local \
    --components=rustc,cargo,rust-std-${triple}; \
    rm -rf /tmp/rust.tar.gz /tmp/rust-1.98.0-${triple}

FROM --platform=${TARGETPLATFORM:-linux/amd64} toolchain AS builder

WORKDIR /app

# First install the dependencies (as they change less often)
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

RUN pnpm install --frozen-lockfile

# pnpm can verify dependencies before each `pnpm run`, so every command
# spawned by turbo re-checks node_modules via file mtimes. Cached install
# layers make those mtimes look stale, and the concurrent auto-installs race
# in the hoisting step (ENOENT unlink in node_modules/.pnpm/node_modules).
# The frozen-lockfile install above is authoritative; skip the check.
ENV pnpm_config_verify_deps_before_run=false

# pass public variables in build step
ARG NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
ARG NEXT_PUBLIC_DEMO_ORG_ID
ARG NEXT_PUBLIC_DEMO_PROJECT_ID
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST

# Copy source code of isolated subworkspace
COPY --from=pruner /app/out/full/ .

RUN turbo run build --filter=worker...

FROM --platform=${TARGETPLATFORM:-linux/amd64} builder AS prod-deps

# previously we copied the --from=builder /app . (includes full node_modules etc)
# we only need the prod + generated prisma client plus .prisma artifacts
# @langfuse/shared still pulls in next-auth transitively, so keep the deploy output
# intact here instead of pruning node_modules in Docker.
# pnpm deploy materializes linked workspace packages into the standalone artifact.
RUN pnpm --filter worker deploy --prod /prod/worker && \
    builder_prisma_client_dir="$(find /app/node_modules/.pnpm -path '*/node_modules/@prisma/client' -type d | head -n 1)" && \
    deployed_prisma_client_dir="$(find /prod/worker/node_modules/.pnpm -path '*/node_modules/@prisma/client' -type d | head -n 1)" && \
    builder_prisma_runtime_dir="$(dirname "$(dirname "$builder_prisma_client_dir")")/.prisma" && \
    deployed_prisma_runtime_dir="$(dirname "$(dirname "$deployed_prisma_client_dir")")/.prisma" && \
    rm -rf "$deployed_prisma_client_dir" "$deployed_prisma_runtime_dir" && \
    cp -R "$builder_prisma_client_dir" "$deployed_prisma_client_dir" && \
    cp -R "$builder_prisma_runtime_dir" "$deployed_prisma_runtime_dir"

FROM --platform=${TARGETPLATFORM:-linux/amd64} runtime-base AS runner

ARG TARGETPLATFORM
ARG BUILDPLATFORM

WORKDIR /app

ARG NEXT_PUBLIC_BUILD_ID
ENV BUILD_ID=$NEXT_PUBLIC_BUILD_ID

ENV NODE_ENV production
ENV DOCKER_BUILD 0

# The non-root user (expressjs, uid 1001) is created in the runtime-base stage.

# Copy only production worker payload instead of full builder workspace (just /prod/worker not entire /app)
COPY --from=prod-deps --chown=expressjs:expressjs /prod/worker ./worker
RUN chmod +x ./worker/entrypoint.sh
# Numeric USER (uid of expressjs) so runAsNonRoot checks and Iron Bank
# hardening validation can verify the user without resolving names.
ARG UID=1001
USER ${UID}

EXPOSE 3030
ENV PORT=3030

# Docker ENTRYPOINT (dumb-init) is covered by semantic versioning, not the entrypoint.sh itself
# Reasoning: ENTRYPOINT is overridden by some self-hosted deployments, thus changing this is breaking
ENTRYPOINT ["dumb-init", "--", "./worker/entrypoint.sh"]

# startup command
CMD ["node", "worker/dist/index.js"]
