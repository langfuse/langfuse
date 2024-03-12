FROM node:20-alpine AS base
 
FROM base AS builder
RUN apk add --no-cache libc6-compat

# # It's important to update the index before installing packages to ensure you're getting the latest versions.
# # Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update && apk upgrade --no-cache libcrypto3 libssl3 libc6-compat

# Set working directory
WORKDIR /app
RUN yarn global add turbo
COPY . .

# # remove middleware.ts if it exists - not needed in self-hosted environments
RUN rm -f ./src/middleware.ts

# # Prune deps
RUN turbo prune web --docker
 
# Add lockfile and package.json's of isolated subworkspace
FROM base AS installer
RUN apk update
WORKDIR /app

# # Next.js collects completely anonymous telemetry data about general usage.
# # Learn more here: https://nextjs.org/telemetry
# # Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED 1

# # Disable validation of environment variables during build
ENV DOCKER_BUILD 1
 
# First install the dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/yarn.lock ./yarn.lock
RUN yarn install

 
# Build the project
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

RUN yarn build
 
FROM base AS runner

RUN apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV production
# # Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED 1
# # Needed to re-enable validation of environment variables during runtime
ENV DOCKER_BUILD 0

# Required for prisma command in entrypoint.sh
RUN yarn global add prisma
 
# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs
 
COPY --from=installer /app/web/next.config.mjs .
COPY --from=installer /app/web/package.json .
 
# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=installer --chown=nextjs:nodejs /app/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/web/.next/static ./web/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/web/public ./web/public
COPY --from=builder --chown=nextjs:nodejs /app/web/prisma ./web/prisma

RUN ls 

COPY --chown=nextjs:nodejs ./web/entrypoint.sh ./web/entrypoint.sh
RUN chmod +x ./web/entrypoint.sh

USER nextjs

# Default port to 3000
ENV PORT 3000

# CMD ["node", "server.js"]
CMD ["dumb-init", "--", "./web/entrypoint.sh"]