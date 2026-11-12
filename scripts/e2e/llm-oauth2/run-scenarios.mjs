#!/usr/bin/env node
// Drives the OAuth2 LLM connection scenarios against a running stack
// (docker-compose.build.yml + docker-compose.oauth2.yml) through the public
// API. Node built-ins only. Prints PASS/FAIL per scenario, writes the output
// to generated/last-run.txt and exits non-zero on any FAIL. See README.md.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const GENERATED = join(HERE, "generated");
const COMPOSE_ARGS = [
  "compose",
  "--env-file",
  join(HERE, "compose.env"),
  "-f",
  join(REPO_ROOT, "docker-compose.build.yml"),
  "-f",
  join(HERE, "docker-compose.oauth2.yml"),
];

const env = process.env;
// Defaults match docker-compose.oauth2.yml.
const LANGFUSE_URL = env.LANGFUSE_URL ?? "http://localhost:3000";
const PROJECT_ID = env.LANGFUSE_INIT_PROJECT_ID ?? "lf-e2e-project";
const PUBLIC_KEY = env.LANGFUSE_INIT_PROJECT_PUBLIC_KEY ?? "pk-lf-e2e-oauth2";
const SECRET_KEY = env.LANGFUSE_INIT_PROJECT_SECRET_KEY ?? "sk-lf-e2e-oauth2";
const POSTGRES_USER = env.POSTGRES_USER ?? "postgres";
const POSTGRES_DB = env.POSTGRES_DB ?? "postgres";
const KEYCLOAK_HOST_URL = env.E2E_KEYCLOAK_URL ?? "http://localhost:18080";
const FAKE_LLM_HOST_URL = env.E2E_FAKE_LLM_URL ?? "http://localhost:18090";
const KEYCLOAK_ADMIN_USER = env.E2E_KEYCLOAK_ADMIN_USER ?? "admin";
const KEYCLOAK_ADMIN_PASSWORD = env.E2E_KEYCLOAK_ADMIN_PASSWORD ?? "admin";

// URLs as Langfuse sees them on the compose network.
const REALM = "lf-e2e";
const KEYCLOAK_URL = "http://keycloak:8080";
const KEYCLOAK_TOKEN_URL = `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`;
const FAULT_TOKEN_URL = "http://fake-llm:8090/fault/token";
const NOT_LISTED_TOKEN_URL = `${KEYCLOAK_URL}/realms/not-listed/protocol/openid-connect/token`;
const FAKE_LLM_BASE = {
  openai: "http://fake-llm:8090/v1",
  anthropic: "http://fake-llm:8090",
};

const MODEL = "fake-judge";
const NAME_PREFIX = "e2e-";
const ACCESS_TOKEN_LIFESPAN_S = 120;
const TOKEN_REFRESH_MARGIN_S = 60;
const AUTH_METHODS = [
  { method: "client_secret_basic", clientId: "cs-basic" },
  { method: "client_secret_post", clientId: "cs-post" },
  { method: "client_secret_jwt", clientId: "cs-jwt" },
  { method: "private_key_jwt", clientId: "pk-jwt" },
];
const ADAPTERS = ["openai", "anthropic"];
const MAIN_PROVIDER = "e2e-kc-private_key_jwt-openai";
const FAULT_PROVIDER = "e2e-fault-client_secret_basic-openai";

// --- output -------------------------------------------------------------------

const outputLines = [];
let redactions = [];
const redact = (text) =>
  redactions.reduce(
    (acc, secret) => acc.split(secret).join("[redacted]"),
    String(text),
  );
const out = (line = "") => {
  const safe = redact(line);
  console.log(safe);
  outputLines.push(safe);
};
const info = (line) => out(`  - ${line}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

const results = [];
async function scenario(id, title, fn) {
  out();
  out(`=== ${id}. ${title}`);
  const startedAt = Date.now();
  const took = () => `[${Math.round((Date.now() - startedAt) / 1000)}s]`;
  try {
    const detail = await fn();
    results.push({ id, ok: true });
    out(`PASS ${id}. ${title}${detail ? ` (${detail})` : ""} ${took()}`);
  } catch (error) {
    results.push({ id, ok: false });
    out(`FAIL ${id}. ${title}: ${error.message} ${took()}`);
  }
}

async function waitFor(
  what,
  fn,
  { timeoutMs = 120_000, intervalMs = 3_000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last.done) return last.value;
    await sleep(intervalMs);
  }
  throw new Error(
    `timed out after ${timeoutMs / 1000}s waiting for ${what}${last?.detail ? `: ${last.detail}` : ""}`,
  );
}

async function countdown(seconds, reason) {
  info(`waiting ${seconds}s (${reason})`);
  for (let left = seconds; left > 0; left -= 15) {
    await sleep(Math.min(15, left) * 1000);
    if (left - 15 > 0) process.stdout.write(`    ${left - 15}s left\n`);
  }
}

// --- clients ------------------------------------------------------------------

async function http(url, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers:
      body === undefined
        ? headers
        : { "content-type": "application/json", ...headers },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, text, json };
}

const langfuseAuth = `Basic ${Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString("base64")}`;
const langfuse = (method, path, body) =>
  http(`${LANGFUSE_URL}${path}`, {
    method,
    body,
    headers: { authorization: langfuseAuth },
  });
async function langfuseOk(method, path, body) {
  const res = await langfuse(method, path, body);
  check(
    res.status < 300,
    `${method} ${path} returned ${res.status}: ${res.text.slice(0, 300)}`,
  );
  return res.json;
}

const fakeLlm = (method, path, body) =>
  http(`${FAKE_LLM_HOST_URL}${path}`, { method, body });
const fakeStats = async () => (await fakeLlm("GET", "/stats")).json;
const fakeControl = async (body) => {
  const res = await fakeLlm("POST", "/control", body);
  check(res.status === 200, `fake-llm /control returned ${res.status}`);
};

function compose(args) {
  return execFileSync("docker", [...COMPOSE_ARGS, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Job executions are not exposed by the public API; read them from Postgres.
function jobExecutions(traceId) {
  check(/^[0-9a-f]{32}$/.test(traceId), "unexpected trace id");
  const rows = compose([
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    POSTGRES_USER,
    "-d",
    POSTGRES_DB,
    "-At",
    "-c",
    `SELECT coalesce(json_agg(json_build_object('status', status, 'error', error)), '[]') FROM job_executions WHERE project_id = '${PROJECT_ID.replace(/'/g, "''")}' AND job_input_trace_id = '${traceId}'`,
  ]);
  return JSON.parse(rows.trim());
}

const TERMINAL = new Set(["COMPLETED", "ERROR", "CANCELLED"]);
const waitForJobs = (traceId, expected, timeoutMs = 150_000) =>
  waitFor(
    `${expected} finished evaluation job(s) for trace ${traceId}`,
    async () => {
      const jobs = jobExecutions(traceId);
      const finished = jobs.filter((job) => TERMINAL.has(job.status));
      return {
        done: finished.length >= expected,
        value: finished,
        detail: `${jobs.length} job(s): ${jobs.map((j) => j.status).join(", ") || "none yet"}`,
      };
    },
    { timeoutMs },
  );

const waitForScore = (traceId) =>
  waitFor(
    `a score on trace ${traceId}`,
    async () => {
      const res = await langfuse(
        "GET",
        `/api/public/v3/scores?traceId=${traceId}`,
      );
      const scores = res.json?.data ?? [];
      return {
        done: res.status === 200 && scores.length > 0,
        value: scores,
        detail: `GET scores ${res.status}, ${scores.length} score(s)`,
      };
    },
    { timeoutMs: 90_000 },
  );

async function ingestSpan(name) {
  const traceId = randomBytes(16).toString("hex");
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  const attr = (key, value) => ({ key, value: { stringValue: value } });
  const res = await http(`${LANGFUSE_URL}/api/public/otel/v1/traces`, {
    method: "POST",
    headers: { authorization: langfuseAuth },
    body: {
      resourceSpans: [
        {
          resource: { attributes: [attr("service.name", "lf-oauth2-e2e")] },
          scopeSpans: [
            {
              scope: { name: "lf-oauth2-e2e" },
              spans: [
                {
                  traceId,
                  spanId: randomBytes(8).toString("hex"),
                  name,
                  kind: 1,
                  startTimeUnixNano: String(nowNs - 1_000_000_000n),
                  endTimeUnixNano: String(nowNs),
                  attributes: [
                    attr("langfuse.trace.name", name),
                    attr(
                      "langfuse.observation.input",
                      JSON.stringify({
                        question: "What is the capital of France?",
                      }),
                    ),
                    attr(
                      "langfuse.observation.output",
                      JSON.stringify({ answer: "Paris" }),
                    ),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  check(
    res.status < 300,
    `OTel ingestion returned ${res.status}: ${res.text.slice(0, 300)}`,
  );
  info(`ingested span "${name}" in trace ${traceId}`);
  return traceId;
}

async function keycloakAdmin(method, path, body) {
  const tokenRes = await http(
    `${KEYCLOAK_HOST_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: KEYCLOAK_ADMIN_USER,
        password: KEYCLOAK_ADMIN_PASSWORD,
      }).toString(),
    },
  );
  check(
    tokenRes.status === 200,
    `Keycloak admin login returned ${tokenRes.status}`,
  );
  const res = await http(`${KEYCLOAK_HOST_URL}/admin/realms/${REALM}${path}`, {
    method,
    body,
    headers: { authorization: `Bearer ${tokenRes.json.access_token}` },
  });
  check(
    res.status < 300,
    `Keycloak admin ${method} ${path} returned ${res.status}`,
  );
  return res.json;
}

async function setKeycloakClientEnabled(clientId, enabled) {
  const [client] = await keycloakAdmin(
    "GET",
    `/clients?clientId=${encodeURIComponent(clientId)}`,
  );
  check(client, `Keycloak client ${clientId} not found`);
  await keycloakAdmin("PUT", `/clients/${client.id}`, { ...client, enabled });
}

// --- Langfuse objects ---------------------------------------------------------

function connectionBody({ provider, adapter, oauth2, secretKey }) {
  return {
    provider,
    adapter,
    baseURL: FAKE_LLM_BASE[adapter],
    secretKey,
    customModels: [MODEL],
    withDefaultModels: false,
    config: { oauth2 },
  };
}

async function createEvaluator(name, provider) {
  const evaluator = await langfuseOk("POST", "/api/public/v2/evaluators", {
    name,
    description: "OAuth2 e2e judge backed by fake-llm",
    type: "llm_as_judge",
    prompt:
      "Rate how well the answer fits the question.\n\nQuestion: {{input}}\nAnswer: {{output}}",
    modelConfig: { provider, model: MODEL },
    variableMapping: [
      { variable: "input", source: "input" },
      { variable: "output", source: "output" },
    ],
    outputDefinition: {
      dataType: "NUMERIC",
      minValue: 0,
      maxValue: 1,
      scoreReasoningInstructions: "One short sentence.",
      scoreValueInstructions: "0 is wrong, 1 is right.",
    },
  });
  return evaluator.id;
}

async function createRule(name, spanName, evaluatorIds) {
  const rule = await langfuseOk("POST", "/api/public/v2/evaluation-rules", {
    name,
    enabled: true,
    sampling: 1,
    filter: [
      {
        type: "stringOptions",
        column: "name",
        operator: "any of",
        value: [spanName],
      },
    ],
    evaluatorAssignments: evaluatorIds.map((evaluatorId) => ({ evaluatorId })),
  });
  return rule.id;
}

async function deleteOwnObjects() {
  const rules = (
    await langfuseOk("GET", "/api/public/v2/evaluation-rules?limit=100")
  ).data;
  for (const rule of rules.filter((r) => r.name.startsWith(NAME_PREFIX))) {
    await langfuseOk("DELETE", `/api/public/v2/evaluation-rules/${rule.id}`);
  }
  const evaluators = (
    await langfuseOk("GET", "/api/public/v2/evaluators?limit=100")
  ).data;
  for (const evaluator of evaluators.filter((e) =>
    e.name.startsWith(NAME_PREFIX),
  )) {
    await langfuseOk("DELETE", `/api/public/v2/evaluators/${evaluator.id}`);
  }
}

const getEvaluator = (id) =>
  langfuseOk("GET", `/api/public/v2/evaluators/${id}`);

// --- main -----------------------------------------------------------------------

const readGenerated = (name) =>
  JSON.parse(readFileSync(join(GENERATED, name), "utf8"));
let secrets;
let privateJwk;
try {
  secrets = readGenerated("secrets.json");
  privateJwk = readGenerated("pk-jwt.private.jwk.json");
} catch {
  console.error(
    "generated/ is missing: run scripts/e2e/llm-oauth2/setup.sh first",
  );
  process.exit(1);
}
const secretFor = (clientId) =>
  clientId === "pk-jwt" ? JSON.stringify(privateJwk) : secrets[clientId];
redactions = [
  ...Object.values(secrets),
  privateJwk.d,
  privateJwk.p,
  privateJwk.q,
];

out(`OAuth2 LLM connection e2e, ${new Date().toISOString()}`);
out(
  `Langfuse ${LANGFUSE_URL}, project ${PROJECT_ID}, Keycloak ${KEYCLOAK_HOST_URL}, fake-llm ${FAKE_LLM_HOST_URL}`,
);

const ids = {};
await scenario(
  0,
  "preflight: services up, previous e2e objects removed",
  async () => {
    await waitFor(
      "Langfuse health",
      async () => {
        const res = await http(`${LANGFUSE_URL}/api/public/health`).catch(
          () => ({ status: 0 }),
        );
        return { done: res.status === 200, detail: `status ${res.status}` };
      },
      { timeoutMs: 180_000 },
    );
    await waitFor("fake-llm health", async () => {
      const res = await fakeLlm("GET", "/health").catch(() => ({ status: 0 }));
      return { done: res.status === 200 };
    });
    await waitFor(
      "Keycloak realm",
      async () => {
        const res = await http(`${KEYCLOAK_HOST_URL}/realms/${REALM}`).catch(
          () => ({ status: 0 }),
        );
        return { done: res.status === 200 };
      },
      { timeoutMs: 180_000 },
    );
    await setKeycloakClientEnabled("pk-jwt", true);
    await fakeControl({ tokenMode: "ok", gateway401Once: false, reset: true });
    await deleteOwnObjects();
  },
);

if (results.at(-1)?.ok) {
  await scenario(
    1,
    "PUT connection per method x adapter (Keycloak preset x4, Custom private_key_jwt x2)",
    async () => {
      const puts = [];
      for (const adapter of ADAPTERS) {
        for (const { method, clientId } of AUTH_METHODS) {
          puts.push({
            provider: `e2e-kc-${method}-${adapter}`,
            adapter,
            clientId,
            oauth2: {
              provider: "keycloak",
              baseUrl: KEYCLOAK_URL,
              realm: REALM,
              clientId,
              authMethod: method,
            },
          });
        }
        puts.push({
          provider: `e2e-custom-private_key_jwt-${adapter}`,
          adapter,
          clientId: "pk-jwt",
          oauth2: {
            provider: "custom",
            tokenEndpoint: KEYCLOAK_TOKEN_URL,
            clientId: "pk-jwt",
            authMethod: "private_key_jwt",
            assertionAudience: KEYCLOAK_TOKEN_URL,
          },
        });
      }
      const failures = [];
      for (const put of puts) {
        const res = await langfuse(
          "PUT",
          "/api/public/llm-connections",
          connectionBody({ ...put, secretKey: secretFor(put.clientId) }),
        );
        const leaked = redactions.some((s) => s && res.text.includes(s));
        info(
          `${put.provider}: ${res.status}${leaked ? " (response contains secret material!)" : ""}`,
        );
        if (res.status !== 200 && res.status !== 201)
          failures.push(
            `${put.provider} ${res.status}: ${res.text.slice(0, 200)}`,
          );
        if (leaked)
          failures.push(`${put.provider} response contains secret material`);
      }
      ids.matrixProviders = puts.map((p) => p.provider);
      check(failures.length === 0, failures.join("; "));
      return `${puts.length} connections`;
    },
  );

  await scenario(
    "1b",
    "every connection mints a token and scores a trace",
    async () => {
      const evaluatorIds = [];
      for (const provider of ids.matrixProviders ?? []) {
        evaluatorIds.push(
          await createEvaluator(`e2e-matrix-${provider}`, provider),
        );
      }
      check(evaluatorIds.length > 0, "no connections from scenario 1");
      await createRule("e2e-matrix", "e2e-matrix", evaluatorIds);
      const traceId = await ingestSpan("e2e-matrix");
      const jobs = await waitForJobs(traceId, evaluatorIds.length);
      const failed = jobs.filter((job) => job.status !== "COMPLETED");
      info(
        `${jobs.length} job(s): ${jobs.length - failed.length} COMPLETED, ${failed.length} not`,
      );
      check(
        failed.length === 0,
        failed.map((job) => `${job.status}: ${job.error}`).join(" | "),
      );
      const scores = await waitFor(
        `${evaluatorIds.length} scores`,
        async () => {
          const res = await langfuse(
            "GET",
            `/api/public/v3/scores?traceId=${traceId}&limit=50`,
          );
          const data = res.json?.data ?? [];
          return {
            done: data.length >= evaluatorIds.length,
            value: data,
            detail: `${data.length} score(s)`,
          };
        },
        { timeoutMs: 90_000 },
      );
      return `${scores.length} scores`;
    },
  );

  await scenario(
    2,
    "LLM-as-a-Judge on the Keycloak private_key_jwt openai connection scores a trace",
    async () => {
      ids.mainEvaluator = await createEvaluator(
        "e2e-main-judge",
        MAIN_PROVIDER,
      );
      await createRule("e2e-main", "e2e-main", [ids.mainEvaluator]);
      await fakeControl({ reset: true });
      const traceId = await ingestSpan("e2e-main");
      const [job] = await waitForJobs(traceId, 1);
      check(job.status === "COMPLETED", `job ${job.status}: ${job.error}`);
      const scores = await waitForScore(traceId);
      const stats = await fakeStats();
      ids.tokensAfter2 = stats.tokens
        .filter((t) => t.azp === "pk-jwt")
        .map((t) => t.fp);
      info(`fake-llm saw pk-jwt token(s): ${ids.tokensAfter2.join(", ")}`);
      return `score ${scores[0].value}`;
    },
  );

  await scenario(
    3,
    `expired token is refreshed (wait > ${ACCESS_TOKEN_LIFESPAN_S}s, score again)`,
    async () => {
      check(ids.mainEvaluator, "needs scenario 2");
      await countdown(ACCESS_TOKEN_LIFESPAN_S + 5, "access token lifespan");
      const traceId = await ingestSpan("e2e-main");
      const [job] = await waitForJobs(traceId, 1);
      check(job.status === "COMPLETED", `job ${job.status}: ${job.error}`);
      await waitForScore(traceId);
      const stats = await fakeStats();
      const fps = stats.tokens
        .filter((t) => t.azp === "pk-jwt")
        .map((t) => t.fp);
      const fresh = fps.filter((fp) => !ids.tokensAfter2.includes(fp));
      info(
        `fake-llm saw ${fps.length} distinct pk-jwt token(s): ${fps.join(", ")}`,
      );
      check(fresh.length >= 1, "no new access token after the old one expired");
      return `${fps.length} distinct tokens`;
    },
  );

  await scenario(
    4,
    "gateway answers 401 once, next trace still scored",
    async () => {
      check(ids.mainEvaluator, "needs scenario 2");
      const before = await fakeStats();
      await fakeControl({ gateway401Once: true });
      const traceId = await ingestSpan("e2e-main");
      const [job] = await waitForJobs(traceId, 1);
      check(job.status === "COMPLETED", `job ${job.status}: ${job.error}`);
      await waitForScore(traceId);
      const after = await fakeStats();
      const injected = after.injected401 - before.injected401;
      const newTokens = after.tokens.length - before.tokens.length;
      info(
        `fake-llm: ${injected} injected 401, ${newTokens} new token(s) after it`,
      );
      check(
        injected === 1,
        `expected exactly one injected 401, saw ${injected}`,
      );
      check(
        newTokens >= 1,
        "the request after the 401 did not use a fresh token",
      );
      return "one 401, recovered";
    },
  );

  await scenario(
    5,
    "token endpoint answers 503: retries, evaluation ERROR, evaluator stays active",
    async () => {
      const put = await langfuse(
        "PUT",
        "/api/public/llm-connections",
        connectionBody({
          provider: FAULT_PROVIDER,
          adapter: "openai",
          secretKey: secrets["cs-basic"],
          oauth2: {
            provider: "custom",
            tokenEndpoint: FAULT_TOKEN_URL,
            clientId: "cs-basic",
            authMethod: "client_secret_basic",
          },
        }),
      );
      check(
        put.status === 200 || put.status === 201,
        `PUT ${FAULT_PROVIDER} returned ${put.status}: ${put.text.slice(0, 200)}`,
      );
      const evaluatorId = await createEvaluator(
        "e2e-fault-judge",
        FAULT_PROVIDER,
      );
      await createRule("e2e-fault", "e2e-fault", [evaluatorId]);
      const before = await fakeStats();
      await fakeControl({ tokenMode: "503" });
      try {
        const traceId = await ingestSpan("e2e-fault");
        const [job] = await waitForJobs(traceId, 1);
        info(`job ${job.status}: ${job.error}`);
        check(job.status === "ERROR", `expected ERROR, got ${job.status}`);
        check(
          String(job.error).includes("unavailable after 3 attempts"),
          `error does not say "unavailable after 3 attempts": ${job.error}`,
        );
        const attempts =
          (await fakeStats()).tokenProxy["503"] - before.tokenProxy["503"];
        info(`fault proxy answered 503 ${attempts} time(s)`);
        check(attempts === 3, `expected 3 token attempts, saw ${attempts}`);
        const evaluator = await getEvaluator(evaluatorId);
        info(
          `evaluator status ${evaluator.status}${evaluator.pausedReason ? ` (${evaluator.pausedReason})` : ""}`,
        );
        check(
          evaluator.status === "active",
          `evaluator is ${evaluator.status} (${evaluator.pausedReason})`,
        );
      } finally {
        await fakeControl({ tokenMode: "ok" });
      }
      return "3 attempts, not blocked";
    },
  );

  await scenario(
    6,
    "Keycloak client disabled: evaluation fails, evaluator blocked LLM_CONNECTION_AUTH_INVALID",
    async () => {
      check(ids.mainEvaluator, "needs scenario 2");
      await setKeycloakClientEnabled("pk-jwt", false);
      try {
        info("disabled Keycloak client pk-jwt");
        await countdown(
          ACCESS_TOKEN_LIFESPAN_S - TOKEN_REFRESH_MARGIN_S + 5,
          "cached access token must age out before Langfuse asks Keycloak again",
        );
        const traceId = await ingestSpan("e2e-main");
        const [job] = await waitForJobs(traceId, 1);
        info(`job ${job.status}: ${job.error}`);
        check(job.status === "ERROR", `expected ERROR, got ${job.status}`);
        const evaluator = await waitFor(
          "evaluator to be blocked",
          async () => {
            const current = await getEvaluator(ids.mainEvaluator);
            return {
              done: current.status === "paused",
              value: current,
              detail: `status ${current.status}`,
            };
          },
          { timeoutMs: 60_000 },
        );
        info(
          `evaluator ${evaluator.status}: ${evaluator.pausedReason}, "${evaluator.pausedMessage}"`,
        );
        check(
          evaluator.pausedReason === "LLM_CONNECTION_AUTH_INVALID",
          `pausedReason is ${evaluator.pausedReason}`,
        );
      } finally {
        await setKeycloakClientEnabled("pk-jwt", true);
      }
      return "blocked";
    },
  );

  await scenario(
    7,
    "PUT with a token endpoint not on the allowlist is rejected",
    async () => {
      const res = await langfuse(
        "PUT",
        "/api/public/llm-connections",
        connectionBody({
          provider: "e2e-not-listed-openai",
          adapter: "openai",
          secretKey: secrets["cs-basic"],
          oauth2: {
            provider: "custom",
            tokenEndpoint: NOT_LISTED_TOKEN_URL,
            clientId: "cs-basic",
            authMethod: "client_secret_basic",
          },
        }),
      );
      info(`${res.status}: ${res.text.slice(0, 300)}`);
      check(res.status === 400, `expected 400, got ${res.status}`);
      check(
        res.text.includes(
          `not in LANGFUSE_LLM_OAUTH2_ALLOWED_TOKEN_ENDPOINTS: ${NOT_LISTED_TOKEN_URL}`,
        ),
        "error does not name the endpoint as not listed",
      );
      return "400";
    },
  );
}

await scenario(
  8,
  "Langfuse web/worker logs hold no JWK, client secret or access token",
  async () => {
    const logs = compose([
      "logs",
      "--no-color",
      "langfuse-web",
      "langfuse-worker",
    ]);
    const needles = {
      "JWK private exponent d": [privateJwk.d],
      "client secrets": Object.values(secrets),
    };
    const hits = Object.entries(needles)
      .map(([label, values]) => [
        label,
        values.filter((v) => logs.includes(v)).length,
      ])
      .filter(([, count]) => count > 0);
    const jwtCount = (
      logs.match(
        /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g,
      ) ?? []
    ).length;
    if (jwtCount > 0) hits.push(["JWT-shaped strings (eyJ...)", jwtCount]);
    info(`scanned ${logs.split("\n").length} log lines`);
    check(
      hits.length === 0,
      `found ${hits.map(([label, count]) => `${count} x ${label}`).join(", ")}`,
    );
    return "no hits";
  },
);

const failed = results.filter((r) => !r.ok);
out();
out(
  `Summary: ${results.length - failed.length} passed, ${failed.length} failed${failed.length ? ` (${failed.map((r) => r.id).join(", ")})` : ""}`,
);
writeFileSync(join(GENERATED, "last-run.txt"), `${outputLines.join("\n")}\n`);
console.log(`(output saved to ${join(GENERATED, "last-run.txt")})`);
process.exit(failed.length === 0 ? 0 : 1);
