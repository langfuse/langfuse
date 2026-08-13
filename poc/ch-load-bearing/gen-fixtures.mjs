// Generates raw OTel ingestion files in today's production shape:
// one JSON file per "export request" = array of ResourceSpan objects,
// mixing the two real-world encodings:
//   - protobuf-decoded shape: ids as {type:"Buffer",data:[...]}, times as {low,high,unsigned}
//   - OTLP/JSON shape:        ids as hex strings,                times as decimal-string nanos
// Uploads to MinIO under otel-poc/{projectId}/w{window}/{uuid}.json and
// writes out/manifest.json with per-window byte counts for the harness.
//
// Usage: node gen-fixtures.mjs [filesTotal=200] [windows=10]
import { randomUUID, randomBytes, randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import { signedFetch } from "./sigv4.mjs";

const MINIO = {
  endpoint: process.env.POC_MINIO_ENDPOINT ?? "http://127.0.0.1:9090",
  bucket: process.env.POC_MINIO_BUCKET ?? "langfuse",
  accessKey: process.env.POC_MINIO_ACCESS_KEY ?? "minio",
  secretKey: process.env.POC_MINIO_SECRET_KEY ?? "miniosecret",
};

const RUN_PREFIX = `otel-poc-${Date.now().toString(36)}`;
const FILES_TOTAL = Number(process.argv[2] ?? 200);
const WINDOWS = Number(process.argv[3] ?? 10);
const PROJECTS = ["proj-alpha", "proj-beta", "proj-gamma"];
const MODELS = ["gpt-4o", "claude-sonnet-5", "gemini-2.5-pro", "llama-3.3-70b"];

const lorem =
  "The quick brown fox jumps over the lazy dog while reasoning about tokens. ";
function text(bytes) {
  let s = "";
  while (s.length < bytes) s += lorem;
  return s.slice(0, bytes);
}

function bufferJson(hex) {
  return { type: "Buffer", data: [...Buffer.from(hex, "hex")] };
}

// protobufjs Long-like: signed int32 halves of a uint64 nanosecond timestamp
function longJson(nanosBigInt) {
  let low = Number(nanosBigInt & 0xffffffffn);
  if (low > 0x7fffffff) low -= 0x100000000;
  const high = Number(nanosBigInt >> 32n);
  return { low, high, unsigned: true };
}

function makeSpan({ protoShaped, withMedia, big }) {
  const traceHex = randomBytes(16).toString("hex");
  const spanHex = randomBytes(8).toString("hex");
  const parentHex = randomBytes(8).toString("hex");
  const startNs =
    BigInt(Date.now() - randomInt(0, 3_600_000)) * 1_000_000n +
    BigInt(randomInt(0, 999_999));
  const endNs = startNs + BigInt(randomInt(5, 30_000)) * 1_000_000n;

  const inputBytes = big ? randomInt(50_000, 200_000) : randomInt(500, 5_000);
  const outputBytes = big ? randomInt(20_000, 80_000) : randomInt(200, 3_000);
  let input = JSON.stringify([
    { role: "system", content: text(Math.floor(inputBytes / 4)) },
    { role: "user", content: text(inputBytes) },
  ]);
  if (withMedia) {
    const blob = randomBytes(randomInt(8_000, 40_000)).toString("base64");
    input = input.slice(0, -2) + ` data:image/png;base64,${blob}"}]`;
  }

  // realistic OTel GenAI span: ~28 attributes, int values in the
  // transport-correct encoding (decimal string for OTLP/JSON, Long for proto)
  const intVal = (n) => (protoShaped ? longJson(BigInt(n)) : String(n));
  const str = (v) => ({ stringValue: v });
  const attributes = [
    { key: "langfuse.observation.type", value: str("generation") },
    {
      key: "gen_ai.request.model",
      value: str(MODELS[randomInt(0, MODELS.length)]),
    },
    { key: "langfuse.observation.input", value: str(input) },
    { key: "langfuse.observation.output", value: str(text(outputBytes)) },
    { key: "langfuse.observation.metadata.source", value: str("poc-loadgen") },
    { key: "gen_ai.system", value: str("openai") },
    { key: "gen_ai.operation.name", value: str("chat") },
    {
      key: "gen_ai.response.model",
      value: str(MODELS[randomInt(0, MODELS.length)]),
    },
    {
      key: "gen_ai.response.id",
      value: str(`chatcmpl-${randomBytes(12).toString("hex")}`),
    },
    { key: "gen_ai.request.temperature", value: { doubleValue: 0.7 } },
    { key: "gen_ai.request.max_tokens", value: { intValue: intVal(4096) } },
    { key: "gen_ai.request.top_p", value: { doubleValue: 1 } },
    {
      key: "gen_ai.usage.input_tokens",
      value: { intValue: intVal(randomInt(100, 20_000)) },
    },
    {
      key: "gen_ai.usage.output_tokens",
      value: { intValue: intVal(randomInt(10, 4_000)) },
    },
    {
      key: "gen_ai.usage.total_tokens",
      value: { intValue: intVal(randomInt(110, 24_000)) },
    },
    {
      key: "langfuse.trace.name",
      value: str(`pipeline-run-${randomInt(0, 20)}`),
    },
    { key: "langfuse.session.id", value: str(randomUUID()) },
    { key: "langfuse.user.id", value: str(`user-${randomInt(0, 5000)}`) },
    { key: "langfuse.environment", value: str("production") },
    { key: "langfuse.release", value: str(`v2.${randomInt(0, 40)}.0`) },
    { key: "langfuse.version", value: str(`${randomInt(1, 9)}.0.0`) },
    { key: "langfuse.observation.level", value: str("DEFAULT") },
    { key: "langfuse.prompt.name", value: str(`prompt-${randomInt(0, 30)}`) },
    {
      key: "langfuse.prompt.version",
      value: { intValue: intVal(randomInt(1, 12)) },
    },
    {
      key: "langfuse.observation.metadata.attempt",
      value: { intValue: intVal(randomInt(1, 3)) },
    },
    { key: "langfuse.observation.metadata.region", value: str("eu-west-1") },
    { key: "server.address", value: str("api.openai.com") },
    { key: "http.response.status_code", value: { intValue: intVal(200) } },
  ];

  return {
    traceId: protoShaped ? bufferJson(traceHex) : traceHex,
    spanId: protoShaped ? bufferJson(spanHex) : spanHex,
    parentSpanId: protoShaped ? bufferJson(parentHex) : parentHex,
    name: `llm-call-${randomInt(0, 50)}`,
    kind: randomInt(1, 4),
    startTimeUnixNano: protoShaped ? longJson(startNs) : startNs.toString(),
    endTimeUnixNano: protoShaped ? longJson(endNs) : endNs.toString(),
    attributes,
    status:
      Math.random() < 0.1
        ? { code: 2, message: "upstream provider timeout" }
        : {},
  };
}

function makeResourceSpan({ protoShaped, project }) {
  const spanCount = randomInt(3, 25);
  const spans = [];
  for (let i = 0; i < spanCount; i++) {
    spans.push(
      makeSpan({
        protoShaped,
        withMedia: Math.random() < 0.05,
        big: Math.random() < 0.1,
      }),
    );
  }
  return {
    resource: {
      attributes: [
        { key: "service.name", value: { stringValue: `${project}-service` } },
        { key: "deployment.environment", value: { stringValue: "production" } },
        { key: "telemetry.sdk.language", value: { stringValue: "nodejs" } },
        { key: "telemetry.sdk.name", value: { stringValue: "opentelemetry" } },
        { key: "telemetry.sdk.version", value: { stringValue: "1.30.1" } },
        {
          key: "service.version",
          value: { stringValue: `1.${randomInt(0, 99)}.0` },
        },
        { key: "service.namespace", value: { stringValue: project } },
        { key: "service.instance.id", value: { stringValue: randomUUID() } },
        {
          key: "host.name",
          value: {
            stringValue: `ip-10-0-${randomInt(0, 255)}-${randomInt(0, 255)}`,
          },
        },
        { key: "os.type", value: { stringValue: "linux" } },
        { key: "cloud.provider", value: { stringValue: "aws" } },
        { key: "cloud.region", value: { stringValue: "eu-west-1" } },
        { key: "process.runtime.name", value: { stringValue: "nodejs" } },
      ],
    },
    scopeSpans: [
      {
        scope: { name: "langfuse-sdk", version: "4.0.0" },
        spans,
      },
    ],
  };
}

async function main() {
  const manifest = {
    prefix: RUN_PREFIX,
    windows: [],
    generatedAt: new Date().toISOString(),
  };
  const perWindow = Math.ceil(FILES_TOTAL / WINDOWS);
  let uploaded = 0;

  for (let w = 0; w < WINDOWS; w++) {
    const windowId = `w${String(w).padStart(4, "0")}`;
    let windowBytes = 0;
    let windowFiles = 0;
    const puts = [];

    for (
      let f = 0;
      f < perWindow && uploaded + windowFiles < FILES_TOTAL;
      f++
    ) {
      const project = PROJECTS[randomInt(0, PROJECTS.length)];
      const protoShaped = Math.random() < 0.7;
      // 1-3 resourceSpans per file, like real export requests
      const body = JSON.stringify(
        Array.from({ length: randomInt(1, 4) }, () =>
          makeResourceSpan({ protoShaped, project }),
        ),
      );
      const key = `${RUN_PREFIX}/${project}/${windowId}/${randomUUID()}.json`;
      windowBytes += Buffer.byteLength(body);
      windowFiles += 1;
      puts.push(
        signedFetch({
          method: "PUT",
          endpoint: MINIO.endpoint,
          path: `/${MINIO.bucket}/${key}`,
          body,
          accessKey: MINIO.accessKey,
          secretKey: MINIO.secretKey,
        }).then((r) => {
          if (!r.ok) throw new Error(`PUT ${key} -> ${r.status}`);
        }),
      );
    }

    await Promise.all(puts);
    uploaded += windowFiles;
    manifest.windows.push({ windowId, files: windowFiles, bytes: windowBytes });
    console.log(
      `window ${windowId}: ${windowFiles} files, ${(windowBytes / 1e6).toFixed(1)} MB`,
    );
  }

  writeFileSync(
    new URL("./out/manifest.json", import.meta.url),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const totalMB = manifest.windows.reduce((a, w) => a + w.bytes, 0) / 1e6;
  console.log(`done: ${uploaded} files, ${totalMB.toFixed(1)} MB total`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
