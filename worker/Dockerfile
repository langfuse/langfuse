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

FROM --platform=${TARGETPLATFORM:-linux/amd64} ${BASE_IMAGE} AS base

# nodejs:24 and openssl (incl. the FIPS provider) come from the freely
# redistributable UBI repos, so no RHEL entitlement is required.
# nodejs-full-i18n is required: the RPM Node is a small-ICU build and V8
# segfaults in Intl.Segmenter (used e.g. by the prisma CLI's output
# formatting) without the full ICU data.
RUN dnf -y upgrade && \
    dnf -y module enable nodejs:24 && \
    dnf -y install --setopt=install_weak_deps=0 nodejs npm nodejs-full-i18n && \
    dnf clean all

FROM --platform=${TARGETPLATFORM:-linux/amd64} base AS build-base
# Pin turbo to avoid nondeterministic prune output from future patch releases.
# pnpm is installed pinned via npm instead of corepack: the corepack shim would
# fetch pnpm from an unpinned CDN on first use.
RUN npm install -g turbo@2.11.3 pnpm@12.6.0
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
RUN dnf -y --installroot /mnt/rootfs --releasever 9 --setopt=install_weak_deps=0 \
    --disableexcludes=all \
    module enable nodejs:24 && \
    dnf -y --installroot /mnt/rootfs --releasever 9 \
    --setopt=install_weak_deps=0 --setopt=tsflags=nodocs \
    --disableexcludes=all \
    install nodejs nodejs-full-i18n bash coreutils-single sed \
    tzdata ca-certificates crypto-policies wget && \
    dnf --installroot /mnt/rootfs clean all && \
    rm -rf /mnt/rootfs/var/cache /mnt/rootfs/var/log/dnf*

# The nodejs RPM drags npm in as a dependency; the runtime image must carry
# no package manager, so remove it from the rootfs (rpmdb stays consistent).
RUN if rpm --root /mnt/rootfs -q npm >/dev/null 2>&1; then \
    rpm --root /mnt/rootfs -e --nodeps npm; \
    fi

# Set the FIPS crypto policy in the rootfs. The policy only restricts TLS and
# algorithm settings (e.g. P-256 instead of X25519) and applies on every host.
# The FIPS provider itself is loaded only when the host kernel runs in FIPS
# mode, which a container cannot switch on. update-crypto-policies is
# python-based and python is deliberately absent from the runtime image, so
# flip the same policy symlinks it would have flipped. Deployments that need
# FIPS 140-3 set LANGFUSE_REQUIRE_FIPS=true: startup then fails unless the
# provider is active (entrypoint.sh and app startup) and an enterprise
# license is configured (app startup).
RUN echo FIPS > /mnt/rootfs/etc/crypto-policies/config && \
    for c in /mnt/rootfs/etc/crypto-policies/back-ends/*.config; do \
    n=$(basename "$c" .config); \
    ln -sfn "/usr/share/crypto-policies/FIPS/$n.txt" "$c"; \
    done

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

# Bake the non-root user into the rootfs (micro has no shadow-utils).
RUN echo "expressjs:x:${GID}:" >> /mnt/rootfs/etc/group && \
    echo "expressjs:x:${UID}:${GID}::/home/expressjs:/sbin/nologin" >> /mnt/rootfs/etc/passwd

FROM --platform=${TARGETPLATFORM:-linux/amd64} ${MICRO_BASE_IMAGE} AS runtime-base
COPY --from=rpm-installer /mnt/rootfs /

FROM --platform=${TARGETPLATFORM:-linux/amd64} build-base AS pruner

WORKDIR /app

COPY . .
RUN turbo prune --scope=worker --docker

# UBI build toolchain: RPM Node, pnpm, turbo, gcc and Rust. CI's tests-fips job
# also runs the web and worker test suites on this stage with the OpenSSL FIPS
# provider forced on (scripts/ci/fips-tests.sh).
FROM --platform=${TARGETPLATFORM:-linux/amd64} build-base AS toolchain

ARG TARGETARCH

# @langfuse/native is a Rust addon (napi-rs) compiled by `turbo run build` for
# the glibc (`*-unknown-linux-gnu`) target, linked against UBI9's glibc so it
# loads in the runtime image. gcc provides the linker; tar and gzip unpack the
# pinned toolchain; patch (with the base image's curl-minimal) prepares the
# small clickhouse source overlay used by the native encoder.
RUN dnf -y install --setopt=install_weak_deps=0 gcc tar gzip patch && \
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

# The non-root user (expressjs, uid 1001) is baked into the runtime rootfs by
# the rpm-installer stage, since micro has no shadow-utils.

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
