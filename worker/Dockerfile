# The node alpine image is available here: https://github.com/nodejs/docker-node
FROM --platform=${TARGETPLATFORM:-linux/amd64} node:24-alpine AS alpine

# It's important to update the index before installing packages to ensure you're getting the latest versions.
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update && apk upgrade --no-cache libcrypto3 libssl3 libc6-compat busybox ssl_client zlib

FROM --platform=${TARGETPLATFORM:-linux/amd64} alpine AS build-base
# Pin turbo to avoid nondeterministic prune output from future patch releases.
RUN npm install turbo@2.8.20 --global
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN corepack prepare pnpm@10.33.0 --activate

FROM --platform=${TARGETPLATFORM:-linux/amd64} alpine AS runtime-base
# Remove package managers from the runtime image; only build stages need them.
RUN rm -rf /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm && \
    rm -f /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg

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

RUN rm -rf /prod && \
    pnpm --filter worker deploy --legacy --prod /prod/worker && \
    builder_prisma_client_dir="$(find /app/node_modules/.pnpm -path '*/node_modules/@prisma/client' -type d | head -n 1)" && \
    deployed_prisma_client_dir="$(find /prod/worker/node_modules/.pnpm -path '*/node_modules/@prisma/client' -type d | head -n 1)" && \
    builder_prisma_runtime_dir="$(dirname "$(dirname "$builder_prisma_client_dir")")/.prisma" && \
    deployed_prisma_runtime_dir="$(dirname "$(dirname "$deployed_prisma_client_dir")")/.prisma" && \
    rm -rf "$deployed_prisma_client_dir" "$deployed_prisma_runtime_dir" && \
    mkdir -p "$(dirname "$deployed_prisma_client_dir")" && \
    cp -R "$builder_prisma_client_dir" "$deployed_prisma_client_dir" && \
    cp -R "$builder_prisma_runtime_dir" "$deployed_prisma_runtime_dir" && \
    # @langfuse/shared currently brings auth-only Next.js packages that the worker never executes.
    find /prod/worker/node_modules \
      \( -path '*/node_modules/next' -o -path '*/node_modules/next-auth' -o -path '*/.bin/next' \) \
      -exec rm -rf {} +

FROM --platform=${TARGETPLATFORM:-linux/amd64} runtime-base AS runner

ARG TARGETPLATFORM
ARG BUILDPLATFORM

RUN apk add --no-cache dumb-init

WORKDIR /app

ARG NEXT_PUBLIC_BUILD_ID
ENV BUILD_ID=$NEXT_PUBLIC_BUILD_ID

ENV NODE_ENV production
ENV DOCKER_BUILD 0

# Don't run production as root
ARG UID=1001
ARG GID=1001
RUN addgroup --system --gid ${GID} expressjs
RUN adduser --system --uid ${UID} expressjs

COPY --from=prod-deps --chown=expressjs:expressjs /prod/worker ./worker
RUN chmod +x ./worker/entrypoint.sh
USER expressjs

EXPOSE 3030
ENV PORT=3030

# Docker ENTRYPOINT (dumb-init) is covered by semantic versioning, not the entrypoint.sh itself
# Reasoning: ENTRYPOINT is overridden by some self-hosted deployments, thus changing this is breaking
ENTRYPOINT ["dumb-init", "--", "./worker/entrypoint.sh"]

# startup command
CMD ["node", "worker/dist/index.js"]
