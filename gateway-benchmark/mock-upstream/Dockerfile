FROM node:24-alpine

WORKDIR /app
COPY server.mjs ./server.mjs

ENV PORT=8081
EXPOSE 8081
USER node

CMD ["node", "server.mjs"]
