// Generates raw OTel ingestion files in today's production shape:
// one JSON file per "export request" = array of ResourceSpan objects,
// mixing the two real-world encodings:
//   - protobuf-decoded shape: ids as {type:"Buffer",data:[...]}, times as {low,high,unsigned}
//   - OTLP/JSON shape:        ids as hex strings,                times as decimal-string nanos
// Uploads to MinIO/S3 under {parent}otel-poc-s{seed}-.../{projectId}/w{window}/{uuid}.json
// and writes out/manifest.json with per-window byte counts for the harness.
//
// The generator is a measurement instrument, so it is DETERMINISTIC: every
// draw comes from a seeded PRNG (same seed + args => byte-identical corpus,
// same object keys, idempotent re-upload), event sizes follow a continuous
// distribution log-interpolated through measured production event-size
// quantiles (p50 3.1 KB, p90 49.9 KB, p95 102 KB, p99 337 KB, organic tail
// to 8 MB), and payload text is lorem
// interleaved with random hex so it compresses ~8x like real LLM traffic,
// not ~286x like bare repetition.
//
// Usage: node gen-fixtures.mjs [filesTotal=200] [windows=10] [hugeFiles=0] [seed=42]
//   hugeFiles: N seeded-random windows each get one EXTRA file (not counted
//   against filesTotal) carrying a single span with ~60 MB of I/O (10 MB
//   system + 40 MB user + 10 MB output), media in every second one — the
//   file-size-skew stress case, placed unpredictably like production skew.
import { writeFileSync } from "node:fs";
import { signedFetch } from "./sigv4.mjs";

const MINIO = {
  endpoint: process.env.POC_MINIO_ENDPOINT ?? "http://127.0.0.1:9090",
  bucket: process.env.POC_MINIO_BUCKET ?? "langfuse",
  accessKey: process.env.POC_MINIO_ACCESS_KEY ?? "minio",
  secretKey: process.env.POC_MINIO_SECRET_KEY ?? "miniosecret",
};

function intArg(pos, name, fallback) {
  const raw = process.argv[pos];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`${name} must be a non-negative integer, got "${raw}"`);
    process.exit(1);
  }
  return n;
}

const FILES_TOTAL = intArg(2, "filesTotal", 200);
const WINDOWS = intArg(3, "windows", 10);
const HUGE_FILES = intArg(4, "hugeFiles", 0);
const SEED = intArg(5, "seed", 42);
if (WINDOWS < 1) {
  console.error("windows must be >= 1");
  process.exit(1);
}

// POC_CORPUS_PARENT nests the corpus under a parent prefix (e.g. "otel/" on
// the real events bucket, whose lifecycle rule expires that prefix). Both
// engines locate the project by the otel-poc path SEGMENT, so the parent must
// not itself look like one, must end with "/", and must stay clear of URL-
// and ClickHouse-glob-special characters — all three have silently broken
// consumers before, so they are validated here.
const PARENT = process.env.POC_CORPUS_PARENT ?? "";
if (PARENT !== "") {
  const wellFormed = /^([A-Za-z0-9._-]+\/)+$/.test(PARENT);
  const shadowsMarker = PARENT.split("/").some((s) => s.startsWith("otel-poc"));
  if (!wellFormed || shadowsMarker) {
    console.error(
      `POC_CORPUS_PARENT must match ([A-Za-z0-9._-]+/)+ and no segment may ` +
        `start with "otel-poc"; got "${PARENT}"`,
    );
    process.exit(1);
  }
}

// deterministic prefix: same seed + args address the same objects, so a
// regeneration is an idempotent overwrite instead of a silently mixed corpus
const RUN_PREFIX = `${PARENT}otel-poc-s${SEED}-${FILES_TOTAL}x${WINDOWS}h${HUGE_FILES}`;
const PROJECTS = ["proj-alpha", "proj-beta", "proj-gamma"];
const MODELS = ["gpt-4o", "claude-sonnet-5", "gemini-2.5-pro", "llama-3.3-70b"];

// ---- seeded PRNG (mulberry32) and draw helpers ----------------------------

let prngState = SEED >>> 0;
function rnd() {
  prngState = (prngState + 0x6d2b79f5) | 0;
  let t = Math.imul(prngState ^ (prngState >>> 15), 1 | prngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (min, maxExcl) => min + Math.floor(rnd() * (maxExcl - min));
const pick = (arr) => arr[rint(0, arr.length)];

function rhex(n) {
  let s = "";
  while (s.length < n)
    s += ((rnd() * 0x100000000) >>> 0).toString(16).padStart(8, "0");
  return s.slice(0, n);
}

function ruuid() {
  const h = rhex(32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// fixed base instant: seeded corpora stay byte-identical across days, and
// every window lands in one known partition month
const BASE_MS = Date.UTC(2026, 7, 1, 12, 0, 0);

// ---- content -------------------------------------------------------------

const lorem =
  "The quick brown fox jumps over the lazy dog while reasoning about tokens. ";

// lorem interleaved with seeded hex: compresses ~8x under zstd, in the range
// of real LLM text; bare repeated lorem measures ~286x and made the whole
// corpus pathologically compressible
function mix(bytes) {
  const chunks = [];
  let len = 0;
  while (len < bytes) {
    chunks.push(lorem, rhex(16));
    len += lorem.length + 16;
  }
  return chunks.join("").slice(0, bytes);
}

// per-event I/O bytes, log-interpolated through measured production quantiles
const SIZE_ANCHORS = [
  [0.0, 256],
  [0.5, 3_154], // p50 3.08 KiB
  [0.9, 49_940], // p90 48.77 KiB
  [0.95, 101_836], // p95 99.45 KiB
  [0.99, 336_589], // p99 328.7 KiB
  [0.999, 2_000_000], // organic multi-MB tail...
  [1.0, 8_000_000], // ...the ~100 MB extreme is hugeFiles' job
];
function sampleEventBytes() {
  const u = rnd();
  for (let i = 1; i < SIZE_ANCHORS.length; i++) {
    const [u0, b0] = SIZE_ANCHORS[i - 1];
    const [u1, b1] = SIZE_ANCHORS[i];
    if (u <= u1) {
      const t = (u - u0) / (u1 - u0);
      return Math.round(
        Math.exp(Math.log(b0) + t * (Math.log(b1) - Math.log(b0))),
      );
    }
  }
  return SIZE_ANCHORS.at(-1)[1];
}

// ---- OTel shapes ----------------------------------------------------------

function bufferJson(hex) {
  return { type: "Buffer", data: [...Buffer.from(hex, "hex")] };
}

// protobufjs Long-like: signed int32 halves; timestamps decode from fixed64
// as unsigned:true, attribute int64s are signed and decode as unsigned:false
function longJson(nanosBigInt, unsigned) {
  let low = Number(nanosBigInt & 0xffffffffn);
  if (low > 0x7fffffff) low -= 0x100000000;
  const high = Number(nanosBigInt >> 32n);
  return { low, high, unsigned };
}

function makeSpan({ protoShaped, withMedia, huge }) {
  const traceHex = rhex(32);
  const spanHex = rhex(16);
  const parentHex = rhex(16);
  const startNs =
    BigInt(BASE_MS - rint(0, 3_600_000)) * 1_000_000n +
    BigInt(rint(0, 1_000_000));
  const endNs = startNs + BigInt(rint(5, 30_000)) * 1_000_000n;

  // input carries a system + user message; declared sizes are totals
  let inputBytes;
  let outputBytes;
  if (huge) {
    inputBytes = 50_000_000;
    outputBytes = 10_000_000;
  } else {
    const eventBytes = sampleEventBytes();
    const inputShare = 0.6 + 0.25 * rnd();
    inputBytes = Math.max(64, Math.round(eventBytes * inputShare));
    outputBytes = Math.max(32, eventBytes - inputBytes);
  }
  let userContent = mix(Math.ceil(inputBytes * 0.8));
  if (withMedia) {
    const blob = Buffer.from(rhex(2 * rint(8_000, 40_000)), "hex").toString(
      "base64",
    );
    userContent += ` data:image/png;base64,${blob}`;
  }
  const input = JSON.stringify([
    { role: "system", content: mix(Math.floor(inputBytes * 0.2)) },
    { role: "user", content: userContent },
  ]);

  // realistic OTel GenAI span: ~28 attributes, int values in the
  // transport-correct encoding (decimal string for OTLP/JSON, Long for proto)
  const intVal = (n) => (protoShaped ? longJson(BigInt(n), false) : String(n));
  const str = (v) => ({ stringValue: v });
  const attributes = [
    { key: "langfuse.observation.type", value: str("generation") },
    { key: "gen_ai.request.model", value: str(pick(MODELS)) },
    { key: "langfuse.observation.input", value: str(input) },
    { key: "langfuse.observation.output", value: str(mix(outputBytes)) },
    { key: "langfuse.observation.metadata.source", value: str("poc-loadgen") },
    { key: "gen_ai.system", value: str("openai") },
    { key: "gen_ai.operation.name", value: str("chat") },
    { key: "gen_ai.response.model", value: str(pick(MODELS)) },
    { key: "gen_ai.response.id", value: str(`chatcmpl-${rhex(24)}`) },
    { key: "gen_ai.request.temperature", value: { doubleValue: 0.7 } },
    { key: "gen_ai.request.max_tokens", value: { intValue: intVal(4096) } },
    { key: "gen_ai.request.top_p", value: { doubleValue: 1 } },
    {
      key: "gen_ai.usage.input_tokens",
      value: { intValue: intVal(rint(100, 20_000)) },
    },
    {
      key: "gen_ai.usage.output_tokens",
      value: { intValue: intVal(rint(10, 4_000)) },
    },
    {
      key: "gen_ai.usage.total_tokens",
      value: { intValue: intVal(rint(110, 24_000)) },
    },
    { key: "langfuse.trace.name", value: str(`pipeline-run-${rint(0, 20)}`) },
    { key: "langfuse.session.id", value: str(ruuid()) },
    { key: "langfuse.user.id", value: str(`user-${rint(0, 5000)}`) },
    { key: "langfuse.environment", value: str("production") },
    { key: "langfuse.release", value: str(`v2.${rint(0, 40)}.0`) },
    { key: "langfuse.version", value: str(`${rint(1, 9)}.0.0`) },
    { key: "langfuse.observation.level", value: str("DEFAULT") },
    { key: "langfuse.prompt.name", value: str(`prompt-${rint(0, 30)}`) },
    {
      key: "langfuse.prompt.version",
      value: { intValue: intVal(rint(1, 12)) },
    },
    {
      key: "langfuse.observation.metadata.attempt",
      value: { intValue: intVal(rint(1, 3)) },
    },
    { key: "langfuse.observation.metadata.region", value: str("eu-west-1") },
    { key: "server.address", value: str("api.openai.com") },
    { key: "http.response.status_code", value: { intValue: intVal(200) } },
  ];

  return {
    traceId: protoShaped ? bufferJson(traceHex) : traceHex,
    spanId: protoShaped ? bufferJson(spanHex) : spanHex,
    parentSpanId: protoShaped ? bufferJson(parentHex) : parentHex,
    name: `llm-call-${rint(0, 50)}`,
    kind: rint(0, 6), // all SpanKinds 0-5, incl. PRODUCER/CONSUMER/UNSPECIFIED
    startTimeUnixNano: protoShaped
      ? longJson(startNs, true)
      : startNs.toString(),
    endTimeUnixNano: protoShaped ? longJson(endNs, true) : endNs.toString(),
    attributes,
    status:
      rnd() < 0.1 ? { code: 2, message: "upstream provider timeout" } : {},
  };
}

function makeResource(project) {
  return {
    attributes: [
      { key: "service.name", value: { stringValue: `${project}-service` } },
      { key: "deployment.environment", value: { stringValue: "production" } },
      { key: "telemetry.sdk.language", value: { stringValue: "nodejs" } },
      { key: "telemetry.sdk.name", value: { stringValue: "opentelemetry" } },
      { key: "telemetry.sdk.version", value: { stringValue: "1.30.1" } },
      { key: "service.version", value: { stringValue: `1.${rint(0, 99)}.0` } },
      { key: "service.namespace", value: { stringValue: project } },
      { key: "service.instance.id", value: { stringValue: ruuid() } },
      {
        key: "host.name",
        value: { stringValue: `ip-10-0-${rint(0, 255)}-${rint(0, 255)}` },
      },
      { key: "os.type", value: { stringValue: "linux" } },
      { key: "cloud.provider", value: { stringValue: "aws" } },
      { key: "cloud.region", value: { stringValue: "eu-west-1" } },
      { key: "process.runtime.name", value: { stringValue: "nodejs" } },
    ],
  };
}

function makeResourceSpan({ protoShaped, project, spans }) {
  if (!spans) {
    spans = [];
    const spanCount = rint(3, 25);
    for (let i = 0; i < spanCount; i++) {
      spans.push(makeSpan({ protoShaped, withMedia: rnd() < 0.05 }));
    }
  }
  return {
    resource: makeResource(project),
    scopeSpans: [{ scope: { name: "langfuse-sdk", version: "4.0.0" }, spans }],
  };
}

// one trace whose single span carries ~60 MB of I/O — the size-skew case
function makeHugeResourceSpan({ protoShaped, project, withMedia }) {
  return makeResourceSpan({
    protoShaped,
    project,
    spans: [makeSpan({ protoShaped, withMedia, huge: true })],
  });
}

// ---- upload ---------------------------------------------------------------

// bounded fan-out: enough to keep the wire busy, few enough that neither fd
// limits nor S3 SlowDown throttling come into play
function limiter(max) {
  let active = 0;
  const queue = [];
  const runNext = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        runNext();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
}
const putLimit = limiter(12);

// real S3 throws sporadic 500/503s; a multi-minute generation must retry
// them instead of dying (4xx other than 429 stays fatal: those are ours)
async function putObject(key, body) {
  for (let attempt = 1; ; attempt++) {
    let status = 0;
    let detail = "";
    try {
      const r = await signedFetch({
        method: "PUT",
        endpoint: MINIO.endpoint,
        path: `/${MINIO.bucket}/${key}`,
        body,
        accessKey: MINIO.accessKey,
        secretKey: MINIO.secretKey,
      });
      if (r.ok) return;
      status = r.status;
      // S3's XML error body names the actual cause (SlowDown, InvalidToken,
      // RequestTimeTooSkewed...) — keep it
      detail = (await r.text().catch(() => "")).slice(0, 400);
      if (status < 500 && status !== 429)
        throw new Error(`PUT ${key} -> ${status}: ${detail}`);
    } catch (e) {
      if (!e.message?.startsWith("PUT ") && attempt <= 4) {
        // network-level failure: retry like a 5xx
        detail = e.message ?? String(e);
        status = 0;
      } else {
        throw e;
      }
    }
    if (attempt > 4)
      throw new Error(
        `PUT ${key} -> ${status || "network error"} after ${attempt} attempts: ${detail}`,
      );
    const delay = 500 * 2 ** (attempt - 1);
    console.warn(
      `retrying PUT ${key} (attempt ${attempt}, ${status || "network error"}) in ${delay}ms`,
    );
    await new Promise((res) => setTimeout(res, delay));
  }
}

async function main() {
  // pathological files land in seeded-random windows, not the first N: the
  // first-N placement was schedule-optimal (stragglers always overlapped the
  // whole run) and quietly flattered wall-time numbers
  if (HUGE_FILES > WINDOWS)
    console.warn(`hugeFiles capped at windows: ${HUGE_FILES} -> ${WINDOWS}`);
  const shuffled = Array.from({ length: WINDOWS }, (_, i) => i);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rint(0, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const hugeWindows = new Set(shuffled.slice(0, Math.min(HUGE_FILES, WINDOWS)));

  const manifest = {
    prefix: RUN_PREFIX,
    seed: SEED,
    args: { filesTotal: FILES_TOTAL, windows: WINDOWS, hugeFiles: HUGE_FILES },
    sizeAnchors: "measured production event-size quantiles, log-interpolated",
    hugeWindows: [...hugeWindows].sort((a, b) => a - b),
    generatedAt: new Date().toISOString(),
    complete: false,
    windows: [],
  };
  const writeManifest = () =>
    writeFileSync(
      new URL("./out/manifest.json", import.meta.url),
      JSON.stringify(manifest, null, 2) + "\n",
    );

  const perWindow = Math.ceil(FILES_TOTAL / WINDOWS);
  let normalUploaded = 0;

  for (let w = 0; w < WINDOWS; w++) {
    const windowId = `w${String(w).padStart(4, "0")}`;
    let windowBytes = 0;
    let windowFiles = 0;
    const puts = [];

    // huge files are EXTRA: they never consume the filesTotal budget
    for (let f = 0; f < perWindow && normalUploaded < FILES_TOTAL; f++) {
      const project = pick(PROJECTS);
      const protoShaped = rnd() < 0.7;
      // 1-3 resourceSpans per file, like real export requests
      const body = JSON.stringify(
        Array.from({ length: rint(1, 4) }, () =>
          makeResourceSpan({ protoShaped, project }),
        ),
      );
      const key = `${RUN_PREFIX}/${project}/${windowId}/${ruuid()}.json`;
      windowBytes += Buffer.byteLength(body);
      windowFiles += 1;
      normalUploaded += 1;
      puts.push(putLimit(() => putObject(key, body)));
    }

    let hugeNote = "";
    if (hugeWindows.has(w)) {
      const project = pick(PROJECTS);
      const body = JSON.stringify([
        makeHugeResourceSpan({
          protoShaped: rnd() < 0.7,
          project,
          withMedia: w % 2 === 0,
        }),
      ]);
      const key = `${RUN_PREFIX}/${project}/${windowId}/${ruuid()}.json`;
      const bytes = Buffer.byteLength(body);
      windowBytes += bytes;
      windowFiles += 1;
      hugeNote = ` (incl. one ~${(bytes / 1e6).toFixed(0)} MB trace)`;
      puts.push(putLimit(() => putObject(key, body)));
    }

    await Promise.all(puts);
    manifest.windows.push({ windowId, files: windowFiles, bytes: windowBytes });
    // written after every window: a mid-run failure leaves an honest partial
    // manifest for THIS corpus instead of a stale one naming the previous run
    writeManifest();
    console.log(
      `window ${windowId}: ${windowFiles} files, ${(windowBytes / 1e6).toFixed(1)} MB${hugeNote}`,
    );
  }

  manifest.complete = true;
  writeManifest();
  const totalMB = manifest.windows.reduce((a, w) => a + w.bytes, 0) / 1e6;
  const totFiles = manifest.windows.reduce((a, w) => a + w.files, 0);
  console.log(
    `done: ${totFiles} files (${normalUploaded} normal + ${hugeWindows.size} huge), ` +
      `${totalMB.toFixed(1)} MB total, seed=${SEED}, prefix=${RUN_PREFIX}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
