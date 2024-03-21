# src Dockerfile: https://github.com/vercel/turbo/blob/main/examples/with-docker/apps/leaders/Dockerfile
FROM node:20.10-alpine AS alpine

# setup pnpm on the alpine base
FROM alpine as base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN pnpm install turbo --global

FROM base AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat libcrypto3 libssl3 
RUN apk update
# Set working directory
WORKDIR /app
COPY . .
RUN turbo prune --scope=langfuse --docker

# Generate prisma client
RUN pnpm dlx prisma generate -w --schema=admin/langfuse/prisma/schema.prisma

# remove middleware.ts if it exists - not needed in self-hosted environments
RUN rm -f ./src/middleware.ts

# Add lockfile and package.json's of isolated subworkspace
FROM base AS installer
RUN apk add --no-cache libc6-compat
RUN apk update
WORKDIR /app

# First install the dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN pnpm install

# Build the project
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
ARG environment=qa
COPY --from=builder /app/admin/langfuse/.env.${environment} /app/admin/langfuse/.env
RUN SKIP_ENV_VALIDATION=1 pnpm turbo run build:${environment} --filter=langfuse

# use alpine as the thinest image
FROM alpine AS runner
WORKDIR /app


# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=installer /app/admin/langfuse/next.config.mjs .
COPY --from=installer /app/admin/langfuse/package.json .

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=installer --chown=nextjs:nodejs /app/admin/langfuse/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/admin/langfuse/.next/static ./admin/langfuse/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/admin/langfuse/public ./admin/langfuse/public

EXPOSE 3000

# set hostname to localhost
# ENV HOSTNAME "0.0.0.0"

CMD ["npm", "run", "start:migrate"]
