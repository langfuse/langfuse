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

# # Prune deps
RUN turbo prune worker --docker


# Add lockfile and package.json's of isolated subworkspace
FROM base AS installer
RUN apk update
WORKDIR /app
 
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

WORKDIR /app

ENV NODE_ENV production

# Copy the built application from the builder stage
COPY --from=installer /app/worker/dist ./dist
COPY --from=installer /app/worker/package.json .

RUN ls dist/src

EXPOSE 3030

ENV ADDRESS=0.0.0.0 PORT=3030

CMD ["yarn", "start"]