FROM node:24-alpine

RUN apk add --no-cache jq python3
# The entire runtime runs as a single unprivileged user. Lambda MicroVMs set
# `no new privileges`, which prevents `sudo`-based user switching at runtime.
RUN addgroup -S sandbox-server && adduser -S sandbox-server -G sandbox-server

WORKDIR /app

COPY package.json ./package.json
RUN node -e 'const fs = require("node:fs"); const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")); fs.writeFileSync("package.json", JSON.stringify({ name: pkg.name, private: true, type: pkg.type, dependencies: pkg.dependencies }, null, 2));' \
  && npm install --omit=dev

COPY dist ./dist

# Keep `/app` immutable to the runtime user. `/workspace` stays sticky-writable,
# and `/workspace/tool_calls` is recreated from prior tool outputs before each
# tool invocation.
RUN chown -R root:root /app \
  && mkdir -p /workspace \
  && chown sandbox-server:sandbox-server /workspace \
  && chmod 1777 /workspace \
  && mkdir -p /workspace/tool_calls \
  && chown -R sandbox-server:sandbox-server /workspace/tool_calls

EXPOSE 5000

USER sandbox-server

CMD ["node", "/app/dist/server.js"]
