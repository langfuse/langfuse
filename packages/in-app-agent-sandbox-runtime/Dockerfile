FROM node:24-alpine

RUN apk add --no-cache jq python3 sudo
# `sandbox-server` owns the HTTP control plane and the readonly tool_calls tree.
# `sandbox-tool` runs every tool operation via a tightly scoped sudo rule.
RUN addgroup -S sandbox-server && adduser -S sandbox-server -G sandbox-server \
  && addgroup -S sandbox-tool && adduser -S sandbox-tool -G sandbox-tool

WORKDIR /app

COPY package.json ./package.json
RUN node -e 'const fs = require("node:fs"); const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")); fs.writeFileSync("package.json", JSON.stringify({ name: pkg.name, private: true, type: pkg.type, dependencies: pkg.dependencies }, null, 2));' \
  && npm install --omit=dev

COPY dist ./dist

# Keep `/app` immutable to the runtime users; the server only needs read/execute.
# `/workspace` stays sticky-writable for the tool user, while `/workspace/tool_calls`
# is precreated as a server-owned readonly subtree that the tool user cannot claim.
RUN chown -R root:root /app \
  && printf 'sandbox-server ALL=(sandbox-tool:sandbox-tool) NOPASSWD: /usr/local/bin/node /app/dist/toolRunner.js\n' > /etc/sudoers.d/sandbox-tool-runner \
  && chmod 0440 /etc/sudoers.d/sandbox-tool-runner \
  && mkdir -p /workspace \
  && chown sandbox-server:sandbox-server /workspace \
  && chmod 1777 /workspace \
  && mkdir -p /workspace/tool_calls \
  && chown -R sandbox-server:sandbox-server /workspace/tool_calls \
  && chmod 0555 /workspace/tool_calls

EXPOSE 5000

USER sandbox-server

CMD ["node", "/app/dist/server.js"]
