// Fake LLM gateway for the OAuth2 LLM connection e2e harness (Node built-ins only).
//
// Routes:
//   POST /v1/chat/completions  OpenAI-compatible, judge-shaped answer
//   POST /v1/messages          Anthropic, judge-shaped answer
//   POST /fault/token          proxy to the Keycloak token endpoint, with fault modes
//   POST /control              { tokenMode?: "ok" | "503" | "slow", gateway401Once?: boolean, reset?: boolean }
//   GET  /stats                counters and token fingerprints seen
//   GET  /health
//
// LLM routes require `Authorization: Bearer <access token>` and verify it as an
// RS256 JWT against the realm JWKS (signature and `exp`). Tokens are never
// logged or returned; only a SHA-256 fingerprint (12 hex chars) is.
import { createServer } from "node:http";
import { createHash, createPublicKey, verify } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8090);
const KEYCLOAK_URL = process.env.KEYCLOAK_URL ?? "http://keycloak:8080";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM ?? "lf-e2e";
// Longer than the 10 s per-attempt timeout of the Langfuse token client.
const FAULT_SLOW_MS = Number(process.env.FAULT_SLOW_MS ?? 15_000);
const MAX_BODY_BYTES = 5 * 1024 * 1024;

const realmUrl = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`;
const jwksUrl = `${realmUrl}/protocol/openid-connect/certs`;
const tokenUrl = `${realmUrl}/protocol/openid-connect/token`;
const TOKEN_MODES = ["ok", "503", "slow"];

const control = { tokenMode: "ok", gateway401Once: false };
let stats = emptyStats();

function emptyStats() {
  return {
    llmRequests: { "chat.completions": 0, messages: 0 },
    // fingerprint -> { fp, azp, iat, routes, requests }
    tokens: {},
    injected401: 0,
    rejected401: 0,
    tokenProxy: { ok: 0, 503: 0, slow: 0 },
  };
}

const log = (message) =>
  console.log(`${new Date().toISOString()} [fake-llm] ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fingerprint = (token) =>
  createHash("sha256").update(token).digest("hex").slice(0, 12);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = (await readBody(req)).toString("utf8");
  return raw.length === 0 ? {} : JSON.parse(raw);
}

// --- token verification -----------------------------------------------------

let signingKeys = new Map();

async function loadSigningKeys() {
  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`JWKS request returned ${res.status}`);
  const { keys } = await res.json();
  signingKeys = new Map(
    keys
      .filter((key) => key.kty === "RSA" && key.use !== "enc")
      .map((key) => [
        key.kid,
        createPublicKey({
          key: { kty: key.kty, n: key.n, e: key.e },
          format: "jwk",
        }),
      ]),
  );
}

async function verifyAccessToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "not a JWT" };
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed JWT" };
  }
  if (header.alg !== "RS256") {
    return { ok: false, reason: `unexpected alg ${header.alg}` };
  }
  if (!signingKeys.has(header.kid)) await loadSigningKeys();
  const key = signingKeys.get(header.kid);
  if (!key) return { ok: false, reason: "unknown kid" };
  const signatureValid = verify(
    "sha256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    Buffer.from(parts[2], "base64url"),
  );
  if (!signatureValid) return { ok: false, reason: "bad signature" };
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

// --- judge answer -------------------------------------------------------------

// Builds a value that satisfies a (simple) JSON schema: the evaluator asks
// for `{ score, scoreExplanation }`, with `score` typed by the evaluator's
// output definition (number with min/max, boolean, or category enum).
function sampleFromSchema(schema, key) {
  if (!schema || typeof schema !== "object") return null;
  if (Array.isArray(schema.anyOf))
    return sampleFromSchema(schema.anyOf[0], key);
  if (Array.isArray(schema.oneOf))
    return sampleFromSchema(schema.oneOf[0], key);
  if (Array.isArray(schema.enum)) return schema.enum[0];
  const type = Array.isArray(schema.type)
    ? schema.type.find((t) => t !== "null")
    : schema.type;
  switch (type) {
    case "object": {
      const result = {};
      for (const [name, inner] of Object.entries(schema.properties ?? {})) {
        result[name] = sampleFromSchema(inner, name);
      }
      return result;
    }
    case "number":
    case "integer":
      return schema.maximum ?? 1;
    case "boolean":
      return true;
    case "array":
      return [sampleFromSchema(schema.items, key)];
    case "string":
      return key === "score"
        ? "1"
        : "The answer addresses the question (fake judge).";
    default:
      return null;
  }
}

const DEFAULT_JUDGE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number", minimum: 0, maximum: 1 },
    scoreExplanation: { type: "string" },
  },
};

function chatCompletion(body) {
  const base = {
    id: `chatcmpl-fake-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body.model ?? "fake-judge",
    usage: { prompt_tokens: 42, completion_tokens: 12, total_tokens: 54 },
  };
  const forcedTool =
    body.tool_choice?.type === "function"
      ? body.tools?.find(
          (t) => t.function?.name === body.tool_choice.function?.name,
        )
      : body.tool_choice === "required"
        ? body.tools?.[0]
        : undefined;
  if (forcedTool) {
    return {
      ...base,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_fake_judge",
                type: "function",
                function: {
                  name: forcedTool.function.name,
                  arguments: JSON.stringify(
                    sampleFromSchema(forcedTool.function.parameters),
                  ),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    };
  }
  const schema =
    body.response_format?.json_schema?.schema ?? DEFAULT_JUDGE_SCHEMA;
  return {
    ...base,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify(sampleFromSchema(schema)),
        },
        finish_reason: "stop",
      },
    ],
  };
}

function anthropicMessage(body) {
  const base = {
    id: `msg_fake_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: body.model ?? "fake-judge",
    stop_sequence: null,
    usage: { input_tokens: 42, output_tokens: 12 },
  };
  const forcedTool =
    body.tool_choice?.type === "tool"
      ? body.tools?.find((t) => t.name === body.tool_choice.name)
      : body.tool_choice?.type === "any"
        ? body.tools?.[0]
        : undefined;
  if (forcedTool) {
    return {
      ...base,
      content: [
        {
          type: "tool_use",
          id: "toolu_fake_judge",
          name: forcedTool.name,
          input: sampleFromSchema(forcedTool.input_schema),
        },
      ],
      stop_reason: "tool_use",
    };
  }
  const schema =
    body.output_config?.format?.schema ??
    body.output_format?.schema ??
    DEFAULT_JUDGE_SCHEMA;
  return {
    ...base,
    content: [{ type: "text", text: JSON.stringify(sampleFromSchema(schema)) }],
    stop_reason: "end_turn",
  };
}

// --- handlers -----------------------------------------------------------------

function unauthorized(res, route, reason) {
  stats.rejected401 += 1;
  log(`POST ${route} 401 (${reason})`);
  if (route === "/v1/messages") {
    return sendJson(res, 401, {
      type: "error",
      error: { type: "authentication_error", message: reason },
    });
  }
  return sendJson(res, 401, {
    error: {
      message: reason,
      type: "invalid_request_error",
      code: "invalid_api_key",
    },
  });
}

async function handleLlm(req, res, route) {
  const routeKey = route === "/v1/messages" ? "messages" : "chat.completions";
  stats.llmRequests[routeKey] += 1;
  const body = await readJson(req);

  if (route === "/v1/messages" && req.headers["x-api-key"] !== undefined) {
    return unauthorized(res, route, "x-api-key must not be sent with OAuth2");
  }
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  if (!match) return unauthorized(res, route, "missing bearer token");
  const token = match[1];
  const fp = fingerprint(token);
  const verdict = await verifyAccessToken(token);
  if (!verdict.ok)
    return unauthorized(res, route, `${verdict.reason}, token ${fp}`);

  const azp = verdict.payload.azp ?? verdict.payload.client_id ?? "unknown";
  const seen = (stats.tokens[fp] ??= {
    fp,
    azp,
    iat: verdict.payload.iat,
    routes: [],
    requests: 0,
  });
  seen.requests += 1;
  if (!seen.routes.includes(routeKey)) seen.routes.push(routeKey);

  if (control.gateway401Once) {
    control.gateway401Once = false;
    stats.injected401 += 1;
    log(`POST ${route} 401 (injected gateway401Once) token=${fp} azp=${azp}`);
    return sendJson(res, 401, {
      error: { message: "injected 401", type: "invalid_request_error" },
    });
  }
  if (body.stream === true) {
    log(`POST ${route} 400 (streaming not supported) token=${fp} azp=${azp}`);
    return sendJson(res, 400, {
      error: {
        message: "fake-llm does not support streaming",
        type: "invalid_request_error",
      },
    });
  }

  log(`POST ${route} 200 token=${fp} azp=${azp} model=${body.model}`);
  return sendJson(
    res,
    200,
    routeKey === "messages" ? anthropicMessage(body) : chatCompletion(body),
  );
}

async function handleFaultToken(req, res) {
  const body = await readBody(req);
  const mode = control.tokenMode;
  stats.tokenProxy[mode] += 1;
  if (mode === "503") {
    log("POST /fault/token 503 (tokenMode 503)");
    return sendJson(res, 503, { error: "temporarily_unavailable" });
  }
  if (mode === "slow") {
    log(`POST /fault/token delaying ${FAULT_SLOW_MS} ms (tokenMode slow)`);
    await sleep(FAULT_SLOW_MS);
  }
  const headers = {
    "content-type":
      req.headers["content-type"] ?? "application/x-www-form-urlencoded",
    accept: "application/json",
  };
  if (req.headers.authorization)
    headers.authorization = req.headers.authorization;
  const upstream = await fetch(tokenUrl, { method: "POST", headers, body });
  const payload = Buffer.from(await upstream.arrayBuffer());
  log(`POST /fault/token ${upstream.status} (proxied, tokenMode ${mode})`);
  res.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") ?? "application/json",
    "content-length": payload.length,
  });
  res.end(payload);
}

async function handleControl(req, res) {
  const body = await readJson(req);
  if (body.tokenMode !== undefined) {
    if (!TOKEN_MODES.includes(body.tokenMode)) {
      return sendJson(res, 400, {
        error: `tokenMode must be one of ${TOKEN_MODES.join(", ")}`,
      });
    }
    control.tokenMode = body.tokenMode;
  }
  if (body.gateway401Once !== undefined) {
    control.gateway401Once = body.gateway401Once === true;
  }
  if (body.reset === true) stats = emptyStats();
  log(
    `control ${JSON.stringify(control)}${body.reset === true ? " (stats reset)" : ""}`,
  );
  return sendJson(res, 200, control);
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://fake-llm");
  try {
    if (req.method === "GET" && pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "GET" && pathname === "/stats") {
      return sendJson(res, 200, {
        ...stats,
        tokens: Object.values(stats.tokens),
        control,
      });
    }
    if (req.method === "POST" && pathname === "/control") {
      return await handleControl(req, res);
    }
    if (req.method === "POST" && pathname === "/fault/token") {
      return await handleFaultToken(req, res);
    }
    if (
      req.method === "POST" &&
      (pathname === "/v1/chat/completions" || pathname === "/v1/messages")
    ) {
      return await handleLlm(req, res, pathname);
    }
    return sendJson(res, 404, { error: `no route ${req.method} ${pathname}` });
  } catch (error) {
    log(`${req.method} ${pathname} 500 (${error.message})`);
    if (!res.headersSent)
      sendJson(res, 500, { error: "fake-llm internal error" });
  }
});

server.listen(PORT, () => log(`listening on :${PORT}, realm ${realmUrl}`));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
