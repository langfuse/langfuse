FROM node:24-alpine

WORKDIR /app
COPY server.mjs ./server.mjs

ENV PORT=4318
EXPOSE 4318
USER node

CMD ["node", "server.mjs"]
