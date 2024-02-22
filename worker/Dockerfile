FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi


FROM base AS builder

# Copying the entire context to /app including package.json
COPY . /app

ENV NODE_ENV production

RUN npm run build

FROM base AS runner

ENV NODE_ENV production

# Copy the built application from the builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 3030

ENV ADDRESS=0.0.0.0 PORT=3030

CMD ["npm", "start"]