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
RUN npm install -g turbo@2.10.5 pnpm@11.22.0

# Runtime rootfs assembled with dnf --installroot and layered onto ubi9-micro:
# the final image carries no package manager, python, or curl. It holds only
# the packages listed below plus their deps, with an intact rpmdb for scanners.
FROM --platform=${TARGETPLATFORM:-linux/amd64} base AS rpm-installer

ARG TARGETARCH
ARG UID=1001
ARG GID=1001

# nodejs-full-i18n is required: the RPM Node is a small-ICU build and V8
# segfaults in Intl.Segmenter (used e.g. by the prisma CLI's output
# formatting) without the full ICU data. sed is used by entrypoint.sh.
RUN dnf -y --installroot /mnt/rootfs --releasever 9 --setopt=install_weak_deps=0 \
    --disableexcludes=all \
    module enable nodejs:24 && \
    dnf -y --installroot /mnt/rootfs --releasever 9 \
    --setopt=install_weak_deps=0 --setopt=tsflags=nodocs \
    --disableexcludes=all \
    install nodejs nodejs-full-i18n bash coreutils-single sed \
    tzdata ca-certificates crypto-policies && \
    dnf --installroot /mnt/rootfs clean all && \
    rm -rf /mnt/rootfs/var/cache /mnt/rootfs/var/log/dnf*

# The nodejs RPM drags npm in as a dependency; the runtime image must carry
# no package manager, so remove it from the rootfs (rpmdb stays consistent).
RUN if rpm --root /mnt/rootfs -q npm >/dev/null 2>&1; then \
    rpm --root /mnt/rootfs -e --nodeps npm; \
    fi

# Activate the FIPS crypto policy in the rootfs so the FIPS provider is used
# even when the container host kernel is not in FIPS mode (on FIPS-mode hosts
# RHEL activates it regardless). update-crypto-policies is python-based and
# python is deliberately absent from the runtime image, so flip the same
# policy symlinks it would have flipped. Full FIPS 140-3 compliance still
# requires a FIPS-mode host; deployments enforce that with
# LANGFUSE_REQUIRE_FIPS=true (checked in entrypoint.sh via crypto.getFips()).
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
RUN echo "nodejs:x:${GID}:" >> /mnt/rootfs/etc/group && \
    echo "nextjs:x:${UID}:${GID}::/home/nextjs:/sbin/nologin" >> /mnt/rootfs/etc/passwd

FROM --platform=${TARGETPLATFORM:-linux/amd64} ${MICRO_BASE_IMAGE} AS runtime-base
COPY --from=rpm-installer /mnt/rootfs /

# prisma CLI + optional dd-trace are npm-installed here and copied into the
# package-manager-less runtime image.
FROM --platform=${TARGETPLATFORM:-linux/amd64} build-base AS web-tools
RUN npm install -g --prefix /opt/prisma-cli --no-package-lock --no-save prisma@6.19.3
ARG NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
RUN mkdir -p /opt/dd/node_modules && \
    if [ -n "$NEXT_PUBLIC_LANGFUSE_CLOUD_REGION" ]; then \
    cd /opt/dd && npm install --no-package-lock --no-save dd-trace@5.109.0; \
    fi

FROM --platform=${BUILDPLATFORM} golang:1.26 AS migrate-builder
ARG TARGETOS
ARG TARGETARCH
ENV CGO_ENABLED=0 \
    GOBIN=/out \
    GOOS=${TARGETOS} \
    GOARCH=${TARGETARCH}
# Build against the validated Go Cryptographic Module snapshot (Go >= 1.24) so
# the migrate CLI's ClickHouse TLS uses FIPS-approved crypto; GOFIPS140 also
# defaults GODEBUG=fips140=on at runtime.
ENV GOFIPS140=v1.0.0
# Build only the ClickHouse migrate CLI Langfuse uses at runtime.
# compile this ourselves instead of downloading the upstream release
# because prebuilt bins bundle many unused drivers and thus inherit CVEs
# eg.: https://github.com/golang-migrate/migrate/issues/1357
RUN /usr/local/go/bin/go install -trimpath -tags 'clickhouse' -ldflags='-s -w' \
    github.com/golang-migrate/migrate/v4/cmd/migrate@v4.19.1

FROM --platform=${TARGETPLATFORM:-linux/amd64} build-base AS pruner

WORKDIR /app

COPY . .
RUN turbo prune --scope=web --docker

FROM --platform=${TARGETPLATFORM:-linux/amd64} build-base AS builder

WORKDIR /app

# First install the dependencies (as they change less often)
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

RUN pnpm install --frozen-lockfile

# pnpm 11 defaults verify-deps-before-run to "install", so every `pnpm run`
# spawned by turbo re-checks node_modules via file mtimes. Cached install
# layers make those mtimes look stale, and the concurrent auto-installs race
# in the hoisting step (ENOENT unlink in node_modules/.pnpm/node_modules).
# The frozen-lockfile install above is authoritative; skip the check.
ENV pnpm_config_verify_deps_before_run=false

ENV DOCKER_BUILD 1
ENV NEXT_MANUAL_SIG_HANDLE true

# Allows the CI docker build smoke test to skip the Next.js type check that
# the lint job already runs (`pnpm run typecheck`). Release builds do not set
# this and still fail on TypeScript errors.
ARG NEXT_IGNORE_BUILD_ERRORS
ENV NEXT_IGNORE_BUILD_ERRORS=$NEXT_IGNORE_BUILD_ERRORS

# pass public variables in build step
ARG NEXT_PUBLIC_PLAIN_APP_ID
ARG NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
ENV NEXT_PUBLIC_LANGFUSE_CLOUD_REGION=$NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
ARG NEXT_PUBLIC_DEMO_ORG_ID
ENV NEXT_PUBLIC_DEMO_ORG_ID=$NEXT_PUBLIC_DEMO_ORG_ID
ARG NEXT_PUBLIC_DEMO_PROJECT_ID
ENV NEXT_PUBLIC_DEMO_PROJECT_ID=$NEXT_PUBLIC_DEMO_PROJECT_ID
ARG NEXT_PUBLIC_SIGN_UP_DISABLED
ENV NEXT_PUBLIC_SIGN_UP_DISABLED=$NEXT_PUBLIC_SIGN_UP_DISABLED
ARG NEXT_PUBLIC_PREVIEW_PR_URL
ENV NEXT_PUBLIC_PREVIEW_PR_URL=$NEXT_PUBLIC_PREVIEW_PR_URL
ARG NEXT_PUBLIC_PREVIEW_PR_AUTHOR
ENV NEXT_PUBLIC_PREVIEW_PR_AUTHOR=$NEXT_PUBLIC_PREVIEW_PR_AUTHOR
ARG NEXT_PUBLIC_PREVIEW_LAST_UPDATED
ENV NEXT_PUBLIC_PREVIEW_LAST_UPDATED=$NEXT_PUBLIC_PREVIEW_LAST_UPDATED
ARG NEXT_PUBLIC_PREVIEW_DEMO_AUTO_SIGN_IN
ENV NEXT_PUBLIC_PREVIEW_DEMO_AUTO_SIGN_IN=$NEXT_PUBLIC_PREVIEW_DEMO_AUTO_SIGN_IN
ARG NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE
ENV NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE=$NEXT_PUBLIC_LANGFUSE_TRACING_SAMPLE_RATE
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
# Origin serving this build's /_next/static/* output. Must be a build arg: the
# bundler writes it into the client runtime's public path, so it cannot be
# changed by a runtime environment variable.
ARG NEXT_PUBLIC_ASSET_PREFIX
ENV NEXT_PUBLIC_ASSET_PREFIX=$NEXT_PUBLIC_ASSET_PREFIX

# Sentry already needs to be set on build time to upload sourcemaps
# This must not be set for OSS releases as we would share our Sentry secret.
ARG SENTRY_AUTH_TOKEN
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ENV SENTRY_ORG=$SENTRY_ORG
ARG SENTRY_PROJECT
ENV SENTRY_PROJECT=$SENTRY_PROJECT

# Accept build id as NEXT_PUBLIC_BUILD_ID
ARG NEXT_PUBLIC_BUILD_ID
ENV NEXT_PUBLIC_BUILD_ID=$NEXT_PUBLIC_BUILD_ID
ENV SENTRY_RELEASE=$NEXT_PUBLIC_BUILD_ID

# Copy source code of isolated subworkspace
COPY --from=pruner /app/out/full/ .

# remove middleware.ts if it exists - not needed in self-hosted environments
RUN rm -f ./web/src/middleware.ts

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED 1
ENV NEXT_MANUAL_SIG_HANDLE true
# set the CI flag to true to get CI specific logs
ENV CI true

RUN NODE_OPTIONS='--max-old-space-size-percentage=75' turbo run build --filter=web...

# Production image, copy all the files and run next
FROM --platform=${TARGETPLATFORM:-linux/amd64} runtime-base AS runner

ARG TARGETPLATFORM
ARG BUILDPLATFORM

WORKDIR /app

ARG NEXT_PUBLIC_BUILD_ID
ENV BUILD_ID=$NEXT_PUBLIC_BUILD_ID
ARG NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
ENV NEXT_PUBLIC_LANGFUSE_CLOUD_REGION=$NEXT_PUBLIC_LANGFUSE_CLOUD_REGION

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED 1
# Needed to re-enable validation of environment variables during runtime
ENV DOCKER_BUILD 0
# Set NEXT_MANUAL_SIG_HANDLE for runtime
ENV NEXT_MANUAL_SIG_HANDLE true

# The non-root user (nextjs, uid 1001) is baked into the runtime rootfs by
# the rpm-installer stage, since micro has no shadow-utils.

# prisma CLI from the tools stage (bin/prisma symlink + lib/node_modules
# structure lands under /usr/local); the runtime image has no npm.
COPY --from=web-tools /opt/prisma-cli /usr/local

# dd-trace, npm-installed in the tools stage (node_modules is empty unless
# NEXT_PUBLIC_LANGFUSE_CLOUD_REGION was set); the standalone output copied
# below merges on top of it.
COPY --from=web-tools --chown=nextjs:nodejs /opt/dd/node_modules ./node_modules

COPY --from=migrate-builder /out/migrate /usr/bin/migrate

COPY --from=builder --chown=nextjs:nodejs /app/web/next.config.mjs .
COPY --from=builder --chown=nextjs:nodejs /app/web/package.json .

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/static ./web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/web/public ./web/public

COPY --from=builder --chown=nextjs:nodejs /app/packages/shared/prisma ./packages/shared/prisma
COPY --from=builder --chown=nextjs:nodejs /app/packages/shared/clickhouse ./packages/shared/clickhouse

COPY --chown=nextjs:nodejs ./web/entrypoint.sh ./web/entrypoint.sh
COPY --chown=nextjs:nodejs ./packages/shared/scripts/cleanup.sql ./packages/shared/scripts/cleanup.sql
RUN chmod +x ./web/entrypoint.sh

# Numeric USER (uid of nextjs) so runAsNonRoot checks and Iron Bank hardening
# validation can verify the user without resolving names.
ARG UID=1001
USER ${UID}

# Default port to 3000
ENV PORT 3000

# Docker ENTRYPOINT (dumb-init) is covered by semantic versioning, not the entrypoint.sh itself
# Reasoning: ENTRYPOINT is overridden by some self-hosted deployments, thus changing this is breaking
ENTRYPOINT ["dumb-init", "--", "./web/entrypoint.sh"]

# startup command - use dd-trace if NEXT_PUBLIC_LANGFUSE_CLOUD_REGION is configured
CMD if [ -n "$NEXT_PUBLIC_LANGFUSE_CLOUD_REGION" ]; then \
    node --import dd-trace/initialize.mjs ./web/server.js --keepAliveTimeout 110000; \
    else \
    node ./web/server.js --keepAliveTimeout 110000; \
    fi
