# The node alpine image is available here: https://github.com/nodejs/docker-node
FROM --platform=${TARGETPLATFORM:-linux/amd64} node:24-alpine AS alpine

# It's important to update the index before installing packages to ensure you're getting the latest versions.
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update && apk upgrade --no-cache libcrypto3 libssl3 libc6-compat busybox ssl_client zlib && \
    apk add --no-cache dumb-init

FROM --platform=${TARGETPLATFORM:-linux/amd64} alpine AS build-base
# Pin turbo to avoid nondeterministic prune output from future patch releases.
RUN npm install turbo@2.10.5 --global
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN corepack prepare pnpm@11.22.0 --activate

FROM --platform=${TARGETPLATFORM:-linux/amd64} alpine AS runtime-base
# package managers, headers, and docs are not used at runtime
RUN rm -rf /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm \
            /root/.cache/node/corepack /opt/yarn-v1.22.22 /usr/local/include \
            /usr/local/share && \
    rm -f /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx \
          /usr/local/bin/yarn /usr/local/bin/yarnpkg \
          /usr/local/CHANGELOG.md /usr/local/README.md /usr/local/LICENSE

FROM --platform=${TARGETPLATFORM:-linux/amd64} build-base AS pruner

WORKDIR /app

COPY . .
RUN turbo prune --scope=worker --docker

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
# @langfuse/shared still pulls in next-auth transitively; drop the Next.js
# compiler/SWC toolchain after deploy because the worker never compiles pages.
# Keep legacy deploy until the worker Docker image is verified with pnpm's default deploy implementation.
COPY scripts/docker/prune-runtime-node-modules.sh /tmp/prune-runtime-node-modules.sh
RUN pnpm --filter worker deploy --legacy --prod /prod/worker && \
    builder_prisma_client_dir="$(find /app/node_modules/.pnpm -path '*/node_modules/@prisma/client' -type d | head -n 1)" && \
    deployed_prisma_client_dir="$(find /prod/worker/node_modules/.pnpm -path '*/node_modules/@prisma/client' -type d | head -n 1)" && \
    builder_prisma_runtime_dir="$(dirname "$(dirname "$builder_prisma_client_dir")")/.prisma" && \
    deployed_prisma_runtime_dir="$(dirname "$(dirname "$deployed_prisma_client_dir")")/.prisma" && \
    rm -rf "$deployed_prisma_client_dir" "$deployed_prisma_runtime_dir" && \
    cp -R "$builder_prisma_client_dir" "$deployed_prisma_client_dir" && \
    cp -R "$builder_prisma_runtime_dir" "$deployed_prisma_runtime_dir" && \
    sh /tmp/prune-runtime-node-modules.sh --dir /prod/worker/node_modules \
      --drop-next-toolchain --drop-prisma-cli && \
    rm -f /tmp/prune-runtime-node-modules.sh

# Assemble the runtime filesystem, then flatten it so deletions actually leave
# the image (COPY + RUN rm keeps the bytes in the parent layer).
FROM --platform=${TARGETPLATFORM:-linux/amd64} runtime-base AS assembled

ARG TARGETPLATFORM
ARG BUILDPLATFORM

WORKDIR /app

ARG NEXT_PUBLIC_BUILD_ID

# Don't run production as root
ARG UID=1001
ARG GID=1001
RUN addgroup --system --gid ${GID} expressjs && \
    adduser --system --uid ${UID} expressjs

# Copy only production worker payload instead of full builder workspace (just /prod/worker not entire /app)
COPY --from=prod-deps --chown=expressjs:expressjs /prod/worker ./worker
RUN chmod +x ./worker/entrypoint.sh && \
    rm -rf /root/.npm /root/.cache /tmp/* /var/cache/apk

FROM scratch AS runner

ARG NEXT_PUBLIC_BUILD_ID

# scratch has an empty PATH; keep the alpine + node locations.
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    BUILD_ID=$NEXT_PUBLIC_BUILD_ID \
    NODE_ENV=production \
    DOCKER_BUILD=0 \
    PORT=3030

COPY --from=assembled / /

WORKDIR /app
USER expressjs

EXPOSE 3030

# Docker ENTRYPOINT (dumb-init) is covered by semantic versioning, not the entrypoint.sh itself
# Reasoning: ENTRYPOINT is overridden by some self-hosted deployments, thus changing this is breaking
ENTRYPOINT ["dumb-init", "--", "./worker/entrypoint.sh"]

# startup command
CMD ["node", "worker/dist/index.js"]
