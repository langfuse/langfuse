# The node alpine image is available here: https://github.com/nodejs/docker-node
FROM --platform=${TARGETPLATFORM:-linux/amd64} node:24-alpine AS alpine

# It's important to update the index before installing packages to ensure you're getting the latest versions.
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update && apk upgrade --no-cache libcrypto3 libssl3 libc6-compat busybox ssl_client

FROM --platform=${TARGETPLATFORM:-linux/amd64} alpine AS base
RUN npm install turbo@^2.7.6 --global
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.5.0 --activate


FROM --platform=${TARGETPLATFORM:-linux/amd64} base AS pruner

WORKDIR /app

COPY . .
RUN turbo prune --scope=worker --docker



FROM --platform=${TARGETPLATFORM:-linux/amd64} base AS builder

WORKDIR /app

# First install the dependencies (as they change less often)
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# pass public variables in build step
ARG NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
ARG NEXT_PUBLIC_DEMO_ORG_ID
ARG NEXT_PUBLIC_DEMO_PROJECT_ID
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST

# Copy source code of isolated subworkspace
COPY --from=pruner /app/out/full/ .

RUN turbo run build --filter=worker...

# Prune dev dependencies and prepare production node_modules
RUN pnpm prune --prod

FROM --platform=${TARGETPLATFORM:-linux/amd64} alpine AS runner

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
RUN addgroup --system --gid ${GID} expressjs && \
    adduser --system --uid ${UID} expressjs

# Copy only necessary files for production
# 1. Worker dist and package.json
COPY --from=builder --chown=expressjs:expressjs /app/worker/dist ./worker/dist
COPY --from=builder --chown=expressjs:expressjs /app/worker/package.json ./worker/package.json

# 2. Shared package dist and package.json
COPY --from=builder --chown=expressjs:expressjs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=expressjs:expressjs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=expressjs:expressjs /app/packages/shared/prisma ./packages/shared/prisma

# 3. Production node_modules (pruned)
COPY --from=builder --chown=expressjs:expressjs /app/node_modules ./node_modules
COPY --from=builder --chown=expressjs:expressjs /app/worker/node_modules ./worker/node_modules
COPY --from=builder --chown=expressjs:expressjs /app/packages/shared/node_modules ./packages/shared/node_modules

# 4. Workspace configuration files
COPY --from=builder --chown=expressjs:expressjs /app/package.json ./package.json
COPY --from=builder --chown=expressjs:expressjs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# 5. Entrypoint
COPY --chown=expressjs:expressjs ./worker/entrypoint.sh ./worker/entrypoint.sh
RUN chmod +x ./worker/entrypoint.sh

USER expressjs

EXPOSE 3030
ENV PORT=3030

# Docker ENTRYPOINT (dumb-init) is covered by semantic versioning, not the entrypoint.sh itself
# Reasoning: ENTRYPOINT is overridden by some self-hosted deployments, thus changing this is breaking
ENTRYPOINT ["dumb-init", "--", "./worker/entrypoint.sh"]

# startup command
CMD ["node", "worker/dist/index.js"]
