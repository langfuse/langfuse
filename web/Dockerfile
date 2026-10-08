# FIPS 140-3 base: Alpine with the distribution's nodejs package instead of
# node:24-alpine. Alpine's Node dynamically links the system libcrypto.so.3, so
# node:crypto routes through the OpenSSL 3.1.2 FIPS provider
# (/usr/lib/ossl-modules/fips.so, CMVP certificate #4985). Upstream node images
# statically bundle their own non-validated OpenSSL and bypass the platform
# module entirely.
# The default is the public Alpine image, so the build needs no credentials.
# Iron Bank's Alpine compiles the FIPS provider from the validated source and
# serves it from an authenticated registry with DoD provenance and scan
# attestations. Release builds opt in after `docker login registry1.dso.mil`
# (free P1 account plus a CLI secret):
#   --build-arg BASE_IMAGE=registry1.dso.mil/ironbank/opensource/alpinelinux/alpine:3.24
ARG BASE_IMAGE=alpine:3.24

# The FIPS provider plus its self-test record (fipsmodule.cnf) and the opt-in
# config that activates it. Iron Bank's Alpine already carries the provider; on
# any other base it is compiled here from the checksum-pinned OpenSSL 3.1.2
# source with the configure flags Iron Bank uses
# (repo1.dso.mil/dsop/opensource/alpinelinux/alpine), so both bases ship the
# same module. Only these files leave the stage; libcrypto and libssl stay
# Alpine's packages, which load the 3.1.2 provider like any other.
FROM --platform=${TARGETPLATFORM:-linux/amd64} ${BASE_IMAGE} AS fips-provider
RUN set -eux; \
    if [ ! -f /usr/lib/ossl-modules/fips.so ]; then \
    apk add --no-cache gcc linux-headers make musl-dev perl; \
    wget -qO /tmp/openssl.tar.gz https://github.com/openssl/openssl/releases/download/openssl-3.1.2/openssl-3.1.2.tar.gz; \
    echo "a0ce69b8b97ea6a35b96875235aa453b966ba3cba8af2de23657d8b6767d6539  /tmp/openssl.tar.gz" | sha256sum -c -; \
    mkdir /tmp/openssl; \
    tar -xzf /tmp/openssl.tar.gz -C /tmp/openssl --strip-components=1; \
    cd /tmp/openssl; \
    perl ./Configure --prefix=/usr --libdir=lib --openssldir=/etc/ssl \
    enable-ktls shared no-zlib no-async no-comp no-idea no-mdc2 no-rc5 \
    no-ec2m no-sm2 no-sm4 no-ssl3 no-seed no-weak-ssl-ciphers enable-fips \
    enable-ec_nistp_64_gcc_128 -Wa,--noexecstack; \
    make -j"$(nproc)" build_sw; \
    make install_sw install_fips; \
    openssl fipsinstall -pedantic -out /etc/ssl/fipsmodule.cnf -module /usr/lib/ossl-modules/fips.so; \
    fi; \
    mkdir -p /out/usr/lib/ossl-modules /out/etc/ssl; \
    cp /usr/lib/ossl-modules/fips.so /out/usr/lib/ossl-modules/fips.so; \
    cp /etc/ssl/fipsmodule.cnf /out/etc/ssl/fipsmodule.cnf

# FIPS mode is opt-in, so installs without it keep OpenSSL's default policy:
# entrypoint.sh points OPENSSL_CONF here when LANGFUSE_REQUIRE_FIPS=true, and
# deployments that override the entrypoint set
# OPENSSL_CONF=/etc/ssl/openssl-fips.cnf themselves. Node reads the nodejs_conf
# section and every other OpenSSL user (e.g. the Prisma engines) openssl_conf,
# so both select it. Only the fips and base providers load, and fips=yes keeps
# every algorithm fetch on the validated module. With
# LANGFUSE_REQUIRE_FIPS=true, startup fails unless it is active and an
# enterprise license is configured.
COPY <<EOF /out/etc/ssl/openssl-fips.cnf
nodejs_conf = fips_init
openssl_conf = fips_init

.include /etc/ssl/fipsmodule.cnf

[fips_init]
providers = provider_sect
alg_section = algorithm_sect

[provider_sect]
fips = fips_sect
base = base_sect

[base_sect]
activate = 1

[algorithm_sect]
default_properties = fips=yes
EOF

FROM --platform=${TARGETPLATFORM:-linux/amd64} ${BASE_IMAGE} AS base

COPY --from=fips-provider /out/ /

# Iron Bank's Alpine activates the FIPS provider in the system openssl.cnf;
# restore the stock file so FIPS stays opt-in on either base (see
# fips-provider above).
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

COPY --from=fips-provider /out/ /

# icu-data-full: see the base stage. tzdata provides the zoneinfo for TZ.
# dumb-init preserves the semver-covered ENTRYPOINT contract. busybox (in the
# base) provides the shell and the sed used by entrypoint.sh, and its wget
# keeps exec-style container health checks working (e.g. `wget --spider
# http://127.0.0.1:<port>/...` in ECS task definitions). Probe 127.0.0.1, not
# localhost: busybox wget only tries the first address localhost resolves to,
# which is ::1, and the server listens on IPv4.
RUN apk upgrade --no-cache && \
    apk add --no-cache nodejs icu-data-full tzdata ca-certificates dumb-init && \
    cp /etc/ssl/openssl.cnf.dist /etc/ssl/openssl.cnf && \
    rm -f /etc/ssl/*.apk-new && \
    addgroup -S -g "${GID}" nodejs && \
    adduser -S -D -H -u "${UID}" -G nodejs -h /home/nextjs -s /sbin/nologin nextjs && \
    apk del --no-cache apk-tools

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
RUN turbo prune web --docker

FROM --platform=${TARGETPLATFORM:-linux/amd64} build-base AS builder

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

# Keep the documented direct golang-migrate recovery paths available in the
# production image while maintaining canonical/ as the only authored tree.
RUN set -eu; \
    node ./packages/shared/clickhouse/scripts/prepare-migrations.mjs materialize ./packages/shared/clickhouse/migrations; \
    chmod 755 ./packages/shared/clickhouse/migrations/clustered ./packages/shared/clickhouse/migrations/unclustered

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

# The non-root user (nextjs, uid 1001) is created in the runtime-base stage.

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
