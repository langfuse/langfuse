# FIPS 140-3 base: UBI 9 with the nodejs:24 module-stream RPM
# instead of node:24-alpine. The RPM Node dynamically links the system
# libcrypto.so.3, so node:crypto routes through RHEL's CMVP-validated OpenSSL
# FIPS provider (/usr/lib64/ossl-modules/fips.so). Upstream node images
# statically bundle their own non-validated OpenSSL and bypass the platform
# module entirely.
# The defaults are Red Hat's public UBI9 images, so the build needs no
# credentials. Iron Bank serves the same content from an authenticated registry
# with DoD provenance and scan attestations. Release builds opt in by overriding
# both args after `docker login registry1.dso.mil` (free P1 account plus a CLI
# secret):
#   --build-arg BASE_IMAGE=registry1.dso.mil/ironbank/redhat/ubi/ubi9:9.8
#   --build-arg MICRO_BASE_IMAGE=registry1.dso.mil/ironbank/redhat/ubi/ubi9-micro:9.8
ARG BASE_IMAGE=registry.access.redhat.com/ubi9/ubi:9.8
ARG MICRO_BASE_IMAGE=registry.access.redhat.com/ubi9/ubi-micro:9.8

# TEMPORARY(node-24.22.1-security): Red Hat's nodejs:24 RPMs rebuilt with
# security fixes from Node 24.22.1 (scripts/docker/nodejs-rpm/). install-nodejs.sh
# uses them only while they are newer than the repos' nodejs, and the check
# below fails the build if the installed Node lacks any of the fixes.
ARG NODEJS_RPM_IMAGE=ghcr.io/langfuse/langfuse-nodejs-rpm:24.21.0-1.lf1@sha256:a64b46f8d92f11dacba52f2d10fc52be62944b5a992d00681a2e9cfa105e9637
FROM ${NODEJS_RPM_IMAGE} AS nodejs-rpm

FROM --platform=${TARGETPLATFORM:-linux/amd64} ${BASE_IMAGE} AS base

# nodejs:24 and openssl (incl. the FIPS provider) come from the freely
# redistributable UBI repos, so no RHEL entitlement is required.
# nodejs-full-i18n is required: the RPM Node is a small-ICU build and V8
# segfaults in Intl.Segmenter (used e.g. by the prisma CLI's output
# formatting) without the full ICU data.
COPY scripts/docker/nodejs-rpm/install-nodejs.sh scripts/docker/nodejs-rpm/test-node-security-fixes.js /opt/nodejs-rpm/
RUN --mount=type=bind,from=nodejs-rpm,source=/rpms,target=/tmp/nodejs-rpms \
    dnf -y upgrade && \
    bash /opt/nodejs-rpm/install-nodejs.sh /tmp/nodejs-rpms \
    nodejs nodejs-libs npm nodejs-full-i18n openssl-fips-provider openssl-fips-provider-so && \
    dnf clean all && \
    node /opt/nodejs-rpm/test-node-security-fixes.js

FROM --platform=${TARGETPLATFORM:-linux/amd64} base AS build-base
# Pin turbo to avoid nondeterministic prune output from future patch releases.
# pnpm is installed pinned via npm instead of corepack: the corepack shim would
# fetch pnpm from an unpinned CDN on first use.
RUN npm install -g turbo@2.11.9 pnpm@12.8.2
# Pass --build-arg NODE_USE_ENV_PROXY=1 when building behind a proxy.
ARG NODE_USE_ENV_PROXY

# Runtime rootfs assembled with dnf --installroot and layered onto ubi9-micro:
# the final image carries no package manager, python, or curl. It holds only
# the packages listed below plus their deps, with an intact rpmdb for scanners.
FROM --platform=${TARGETPLATFORM:-linux/amd64} base AS rpm-installer

ARG TARGETARCH
ARG UID=1001
ARG GID=1001

# nodejs-full-i18n is required: the RPM Node is a small-ICU build and V8
# segfaults in Intl.Segmenter (used e.g. by the prisma CLI's output
# formatting) without the full ICU data.
# wget keeps exec-style container health checks working (e.g. `wget --spider
# http://127.0.0.1:<port>/...` in ECS task definitions); it links GnuTLS,
# which follows the host's FIPS mode like OpenSSL does.
# The rpmdb check fails the build if the rootfs resolved a different nodejs
# than the build stages.
RUN --mount=type=bind,from=nodejs-rpm,source=/rpms,target=/tmp/nodejs-rpms \
    NODEJS_INSTALLROOT=/mnt/rootfs bash /opt/nodejs-rpm/install-nodejs.sh /tmp/nodejs-rpms \
    nodejs nodejs-libs npm nodejs-full-i18n openssl-fips-provider openssl-fips-provider-so \
    bash coreutils-single sed \
    tzdata ca-certificates crypto-policies wget && \
    test "$(rpm --root /mnt/rootfs -q nodejs)" = "$(rpm -q nodejs)" && \
    dnf --installroot /mnt/rootfs clean all && \
    rm -rf /mnt/rootfs/var/cache /mnt/rootfs/var/log/dnf*

# The nodejs RPM drags npm in as a dependency; the runtime image must carry
# no package manager, so remove it from the rootfs (rpmdb stays consistent).
RUN if rpm --root /mnt/rootfs -q npm >/dev/null 2>&1; then \
    rpm --root /mnt/rootfs -e --nodeps npm; \
    fi

# The FIPS crypto policy for OpenSSL ships as an opt-in config instead of
# being activated system-wide, so installs without FIPS mode keep the default
# TLS policy. entrypoint.sh points OPENSSL_CONF at it when
# LANGFUSE_REQUIRE_FIPS=true; deployments that override the entrypoint set
# OPENSSL_CONF=/etc/pki/tls/openssl-fips.cnf themselves. The FIPS provider
# itself loads only when the host kernel runs in FIPS mode; with
# LANGFUSE_REQUIRE_FIPS=true, startup fails unless it is active and an
# enterprise license is configured.
RUN sed 's#/etc/crypto-policies/back-ends/opensslcnf.config#/usr/share/crypto-policies/FIPS/opensslcnf.txt#' \
    /mnt/rootfs/etc/pki/tls/openssl.cnf > /mnt/rootfs/etc/pki/tls/openssl-fips.cnf && \
    grep -q '/usr/share/crypto-policies/FIPS/opensslcnf.txt' /mnt/rootfs/etc/pki/tls/openssl-fips.cnf

# dumb-init is not packaged in UBI; install the pinned, checksum-verified
# static release binary (preserves the semver-covered ENTRYPOINT contract).
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
    amd64) di_arch=x86_64; di_sha256=e874b55f3279ca41415d290c512a7ba9d08f98041b28ae7c2acb19a545f1c4df ;; \
    arm64) di_arch=aarch64; di_sha256=b7d648f97154a99c539b63c55979cd29f005f88430fb383007fe3458340b795e ;; \
    *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /mnt/rootfs/usr/bin/dumb-init "https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_${di_arch}"; \
    echo "${di_sha256}  /mnt/rootfs/usr/bin/dumb-init" | sha256sum -c -; \
    chmod 0755 /mnt/rootfs/usr/bin/dumb-init

# The UBI EULA requires every image derived from UBI to include it unmodified.
# The magic-byte check rejects an HTML error page served in its place.
# Keep in sync with web/Dockerfile and ai-gateway/Dockerfile.
RUN mkdir -p /mnt/rootfs/usr/share/licenses/redhat-ubi && \
    curl -fsSL --retry 5 --retry-all-errors -o /mnt/rootfs/usr/share/licenses/redhat-ubi/EULA_Red_Hat_Universal_Base_Image_English_20190422.pdf \
    https://www.redhat.com/licenses/EULA_Red_Hat_Universal_Base_Image_English_20190422.pdf && \
    head -c 5 /mnt/rootfs/usr/share/licenses/redhat-ubi/EULA_Red_Hat_Universal_Base_Image_English_20190422.pdf | grep -qx '%PDF-'

# Bake the non-root user into the rootfs (micro has no shadow-utils).
RUN echo "expressjs:x:${GID}:" >> /mnt/rootfs/etc/group && \
    echo "expressjs:x:${UID}:${GID}::/home/expressjs:/sbin/nologin" >> /mnt/rootfs/etc/passwd

FROM --platform=${TARGETPLATFORM:-linux/amd64} ${MICRO_BASE_IMAGE} AS runtime-base
COPY --from=rpm-installer /mnt/rootfs /

FROM --platform=${TARGETPLATFORM:-linux/amd64} build-base AS pruner

WORKDIR /app

COPY . .
RUN turbo prune worker --docker

# UBI build toolchain: RPM Node, pnpm, turbo, gcc and Rust. CI's tests-fips job
# also runs the web and worker test suites on this stage with the OpenSSL FIPS
# provider forced on (scripts/ci/fips-tests.sh).
FROM --platform=${TARGETPLATFORM:-linux/amd64} build-base AS toolchain

ARG TARGETARCH

# @langfuse/native is a Rust addon (napi-rs) compiled by `turbo run build` for
# the glibc (`*-unknown-linux-gnu`) target, linked against UBI9's glibc so it
# loads in the runtime image. gcc provides the linker; tar and gzip unpack the
# pinned toolchain.
RUN dnf -y install --setopt=install_weak_deps=0 gcc tar gzip && \
    dnf clean all

# Pinned standalone Rust installer, the exact channel from
# packages/native/rust-toolchain.toml (bump the two together), checksum-verified
# like the dumb-init binary above. Only rustc, cargo and the target's std are
# needed to build; clippy and rustfmt run outside Docker.
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
    amd64) triple=x86_64-unknown-linux-gnu; toolchain_sha256=aa30409afa67bd1ada244cefd82c7980e6a65bc113bb978e934b2413c75e3900 ;; \
    arm64) triple=aarch64-unknown-linux-gnu; toolchain_sha256=5fbb4282403046d52a4672765c6761a809bf9f33e699b17e6eb7a93ab7770cc3 ;; \
    *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/rust.tar.gz "https://static.rust-lang.org/dist/rust-1.98.0-${triple}.tar.gz"; \
    echo "${toolchain_sha256}  /tmp/rust.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/rust.tar.gz -C /tmp; \
    /tmp/rust-1.98.0-${triple}/install.sh --prefix=/usr/local \
    --components=rustc,cargo,rust-std-${triple}; \
    rm -rf /tmp/rust.tar.gz /tmp/rust-1.98.0-${triple}

# cargo-about renders the third-party license notices for the native addon's
# Rust dependencies. cargo-auditable embeds the addon's resolved dependency
# list in the .node binary so image scanners (Trivy, Grype, Docker Scout) can
# match its Rust crates against advisories. Both build from crates.io at pinned
# versions with their own lockfiles; keep the versions in sync with
# ai-gateway/Dockerfile. `napi build` spawns $CARGO instead of cargo when it is
# set, so the build step points it at a wrapper that runs `cargo auditable`.
RUN cargo install --locked --root /usr/local --features cli cargo-about@0.9.2 && \
    cargo install --locked --root /usr/local cargo-auditable@0.7.7 && \
    rm -rf "${CARGO_HOME:-$HOME/.cargo}/registry" && \
    printf '#!/bin/sh\nexec /usr/local/bin/cargo auditable "$@"\n' > /usr/local/bin/cargo-auditable-shim && \
    chmod 0755 /usr/local/bin/cargo-auditable-shim

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

RUN CARGO=/usr/local/bin/cargo-auditable-shim turbo run build --filter=worker...

# Runs after the build so `cargo fetch` adds the sources the build skipped (dev
# and other-target dependencies) that cargo metadata still reads; `generate`
# then reads licenses only from local crate sources and fails on any dependency
# whose license packages/native/about.toml does not accept.
RUN cd packages/native && \
    mkdir -p /usr/share/licenses/langfuse-native && \
    cargo fetch --locked && \
    cargo about generate --frozen --fail about.hbs \
    -o /usr/share/licenses/langfuse-native/THIRD_PARTY_LICENSES.txt

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

# The non-root user (expressjs, uid 1001) is baked into the runtime rootfs by
# the rpm-installer stage, since micro has no shadow-utils.

# Copy only production worker payload instead of full builder workspace (just /prod/worker not entire /app)
COPY --from=prod-deps --chown=expressjs:expressjs /prod/worker ./worker
COPY --from=builder /usr/share/licenses/langfuse-native /usr/share/licenses/langfuse-native
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
