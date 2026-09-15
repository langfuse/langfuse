ARG NODE_VERSION=24.19.0
FROM node:${NODE_VERSION}-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY test ./test

ENV NODE_ENV=production
EXPOSE 3100
USER node

CMD ["node", "src/server.js"]
