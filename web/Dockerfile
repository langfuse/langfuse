# Base image
FROM node:20-alpine AS base

# It's important to update the index before installing packages to ensure you're getting the latest versions.
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update && apk upgrade --no-cache libcrypto3 libssl3 libc6-compat



# Rebuild the source code only when needed
FROM base AS builder

WORKDIR /app
COPY package.json .
COPY tsconfig.json .
COPY yarn.lock .
COPY /shared-langfuse ./shared-langfuse
COPY /web ./web

RUN yarn install --pure-lockfile --non-interactive


# remove middleware.ts if it exists - not needed in self-hosted environments
RUN rm -f ./web/src/middleware.ts

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED 1

# Disable validation of environment variables during build
ENV DOCKER_BUILD 1

# Generate prisma client
RUN yarn workspace web db:generate

# Build the application
RUN npm run build:web

# Production image, copy all the files and run next
FROM base AS runner

RUN apk add --no-cache dumb-init

WORKDIR /app

ENV NODE_ENV production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED 1
# Needed to re-enable validation of environment variables during runtime
ENV DOCKER_BUILD 0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN npm install -g --no-package-lock --no-save prisma

COPY --from=builder /app/web/public ./web/public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/web/prisma ./prisma

COPY --chown=nextjs:nodejs ./web/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

RUN ls
RUN ls /app/

USER nextjs

# Default port to 3000
ENV PORT 3000

# CMD ["node", "server.js"]
CMD ["dumb-init", "--", "./entrypoint.sh"]
