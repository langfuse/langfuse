FROM node:20.10-alpine AS builder

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat libcrypto3 libssl3
RUN apk update

# Set working directory
WORKDIR /app

# Copy package.json and pnpm-lock.yaml
COPY admin/langfuse/package.json ./admin/langfuse/
COPY admin/langfuse/pnpm-lock.yaml ./admin/langfuse/

# Install dependencies
RUN npm install -g pnpm
RUN cd admin/langfuse && pnpm install

# Copy the rest of the application code
COPY . .

# Generate Prisma client
RUN cd admin/langfuse && pnpm dlx prisma generate --schema=prisma/schema.prisma

# Build the project
ARG environment=qa
RUN cd admin/langfuse && pnpm build:${environment}

# Production stage
FROM node:20.10-alpine AS runner

WORKDIR /app

RUN apk add --no-cache dumb-init
RUN npm install -g --no-package-lock --no-save prisma

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Copy built files from the builder stage
COPY --from=builder --chown=nextjs:nodejs /app/admin/langfuse/.next ./admin/langfuse/.next
COPY --from=builder --chown=nextjs:nodejs /app/admin/langfuse/public ./admin/langfuse/public
COPY --from=builder --chown=nextjs:nodejs /app/admin/langfuse/prisma ./admin/langfuse/prisma
COPY --from=builder --chown=nextjs:nodejs /app/admin/langfuse/entrypoint.sh ./admin/langfuse/entrypoint.sh
COPY --from=builder --chown=nextjs:nodejs /app/admin/langfuse/package.json ./admin/langfuse/package.json

RUN chmod +x ./admin/langfuse/entrypoint.sh

EXPOSE 3000

CMD ["dumb-init", "--", "./admin/langfuse/entrypoint.sh"]