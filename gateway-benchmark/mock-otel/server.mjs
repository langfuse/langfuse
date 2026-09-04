import http from "node:http";

const port = readPort(process.env.PORT, 4318);

const stats = {
  startedAt: Date.now(),
  requests: 0,
  bytes: 0,
  invalid: 0,
  resourceSpans: 0,
  spans: 0,
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://benchmark.local");

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/metrics") {
    sendJson(response, 200, {
      ...stats,
      uptimeMs: Date.now() - stats.startedAt,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/reset") {
    stats.startedAt = Date.now();
    stats.requests = 0;
    stats.bytes = 0;
    stats.invalid = 0;
    stats.resourceSpans = 0;
    stats.spans = 0;
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST" || url.pathname !== "/v1/traces") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  stats.requests += 1;

  try {
    const chunks = [];
    for await (const chunk of request) {
      stats.bytes += chunk.length;
      chunks.push(chunk);
    }

    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!payload || !Array.isArray(payload.resourceSpans)) {
      throw new Error("resourceSpans must be an array");
    }

    stats.resourceSpans += payload.resourceSpans.length;
    stats.spans += payload.resourceSpans.reduce(
      (resourceTotal, resourceSpans) =>
        resourceTotal +
        (Array.isArray(resourceSpans?.scopeSpans)
          ? resourceSpans.scopeSpans.reduce(
              (scopeTotal, scopeSpans) =>
                scopeTotal +
                (Array.isArray(scopeSpans?.spans) ? scopeSpans.spans.length : 0),
              0,
            )
          : 0),
      0,
    );
    sendJson(response, 200, {});
  } catch (error) {
    stats.invalid += 1;
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : "invalid_payload",
    });
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;

server.listen(port, "0.0.0.0", () => {
  console.log(`mock-otel listening on :${port}`);
});

function readPort(rawValue, fallback) {
  if (rawValue === undefined) {
    return fallback;
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return value;
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}
