FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json .
COPY yarn.lock .
COPY /shared ./shared
COPY /worker ./worker

RUN yarn install --pure-lockfile --non-interactive --production

COPY ./worker ./worker

RUN ls
RUN ls worker
RUN ls worker/node_modules

ENV NODE_ENV production

RUN yarn run build:worker

FROM base AS runner

ENV NODE_ENV production

# Copy the built application from the builder stage
COPY --from=base /app/worker/dist ./dist

EXPOSE 3030

RUN ls 
RUN ls dist
RUN ls dist/src

ENV ADDRESS=0.0.0.0 PORT=3030

CMD ["node", "dist/src/index.js"]