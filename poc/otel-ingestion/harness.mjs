// PoC driver: schedules the per-window batches for either engine and prints
// the comparison summary. The commit protocol (TRUNCATE -> fill -> count ->
// MOVE PARTITION) lives with each engine implementation:
//   ch   (default)  engine-ch/engine.mjs, one INSERT SELECT per window  [Path A]
//   rust            engine-rust binary — spawned ONCE for the whole run, so
//                   the worker is long-running and per-batch process spawn
//                   (measured at ~50% of worker CPU) is gone           [Path B]
//
// Usage: node harness.mjs [--concurrency N] [--engine ch|rust]
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

import { createChEngine, setup } from "./engine-ch/engine.mjs";

const CH = {
  url: process.env.POC_CH_URL ?? "http://127.0.0.1:8123",
  user: process.env.POC_CH_USER ?? "clickhouse",
  password: process.env.POC_CH_PASSWORD ?? "clickhouse",
};
// endpoint AS SEEN FROM the ClickHouse server (compose network)
const S3_FROM_CH = {
  base: process.env.POC_CH_S3_BASE ?? "http://minio:9000/langfuse",
  accessKey: process.env.POC_MINIO_ACCESS_KEY ?? "minio",
  secretKey: process.env.POC_MINIO_SECRET_KEY ?? "miniosecret",
};

const CONCURRENCY = Math.min(
  4,
  Number(process.argv[process.argv.indexOf("--concurrency") + 1] || 1) || 1,
);
const ENGINE =
  process.argv.indexOf("--engine") > -1
    ? process.argv[process.argv.indexOf("--engine") + 1]
    : (process.env.POC_ENGINE ?? "ch");
if (!["ch", "rust"].includes(ENGINE))
  throw new Error(`unknown engine ${ENGINE}`);
// long-running worker engines: binary + the env var carrying the slot count
const WORKERS = {
  rust: {
    bin:
      process.env.POC_RUST_BIN ??
      new URL("./engine-rust/target/release/rust-worker", import.meta.url)
        .pathname,
    slotsEnv: "POC_RW_SLOTS",
  },
};

async function chq(sql, { json = false } = {}) {
  const res = await fetch(`${CH.url}/?database=poc_chlb`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${CH.user}:${CH.password}`).toString("base64"),
    },
    body: json ? `${sql} FORMAT JSON` : sql,
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(
      `CH ${res.status}: ${text.slice(0, 2000)}\n--- query:\n${sql.slice(0, 500)}`,
    );
  return json ? JSON.parse(text).data : text;
}

async function chRaw(stmt) {
  const res = await fetch(CH.url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${CH.user}:${CH.password}`).toString("base64"),
    },
    body: stmt,
  });
  if (!res.ok) throw new Error(`DDL failed: ${await res.text()}`);
}

function printWindow(r, byWindow) {
  const w = byWindow.get(r.windowId);
  const mb = w.bytes / 1e6;
  console.log(
    `${r.windowId} slot=${r.slot} files=${w.files} mb=${mb.toFixed(1)} rows=${r.rows} ` +
      `insert=${r.insertMs}ms move=${r.moveMs}ms total=${r.totalMs}ms ` +
      `(${(mb / (r.totalMs / 1000)).toFixed(1)} MB/s)`,
  );
  return { ...r, files: w.files, mb };
}

async function runCh(manifest, byWindow) {
  const processWindow = createChEngine({ chq, s3FromCh: S3_FROM_CH });
  const results = [];
  const queue = [...manifest.windows];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, slot) =>
      (async () => {
        for (;;) {
          const w = queue.shift();
          if (!w) return;
          const r = await processWindow(manifest.prefix, w.windowId, slot);
          results.push(printWindow({ ...r, slot }, byWindow));
        }
      })(),
    ),
  );
  return { results, worker: null };
}

// one long-running worker process for the whole run; per-window stat lines
// stream back as JSON, a final {"summary":...} line carries process totals
async function runWorker(spec, manifest, byWindow) {
  const windows = manifest.windows.map((w) => w.windowId);
  const child = spawn(spec.bin, [manifest.prefix, ...windows], {
    env: { ...process.env, [spec.slotsEnv]: String(CONCURRENCY) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const results = [];
  let worker = null;
  for await (const line of createInterface({ input: child.stdout })) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.summary) worker = msg;
    else
      results.push(
        printWindow(
          {
            windowId: msg.window,
            slot: msg.slot,
            rows: msg.rows,
            insertMs: Math.round(msg.insert_ms),
            moveMs: Math.round(msg.move_ms),
            totalMs: Math.round(msg.total_ms),
          },
          byWindow,
        ),
      );
  }
  const code = await new Promise((resolve) => child.on("close", resolve));
  if (code !== 0) throw new Error(`worker exited with code ${code}`);
  return { results, worker };
}

async function main() {
  await setup(chRaw);
  const manifest = JSON.parse(
    readFileSync(new URL("./out/manifest.json", import.meta.url), "utf8"),
  );
  const byWindow = new Map(manifest.windows.map((w) => [w.windowId, w]));

  console.log(
    `engine=${ENGINE} windows=${manifest.windows.length} concurrency=${CONCURRENCY} (staging pool slots)`,
  );
  const runStarted = Date.now();
  const { results, worker } = WORKERS[ENGINE]
    ? await runWorker(WORKERS[ENGINE], manifest, byWindow)
    : await runCh(manifest, byWindow);
  const wallMs = Date.now() - runStarted;

  const totMb = results.reduce((a, r) => a + r.mb, 0);
  const totRows = results.reduce((a, r) => a + r.rows, 0);
  const [{ target_rows }] = await chq(
    `SELECT toUInt64(count()) AS target_rows FROM poc_chlb.events_poc`,
    { json: true },
  );
  console.log("\n=== summary ===");
  console.log(
    `corpus: ${totMb.toFixed(1)} MB, ${totRows} rows staged, ${target_rows} rows in target`,
  );
  console.log(
    `wall: ${(wallMs / 1000).toFixed(1)}s -> ${(totMb / (wallMs / 1000)).toFixed(1)} MB/s, ${Math.round(totRows / (wallMs / 1000))} rows/s`,
  );

  if (worker) {
    console.log(
      `worker: cpu=${(worker.cpu_user_s + worker.cpu_sys_s).toFixed(2)}s ` +
        `max_rss=${(worker.max_rss_bytes / 1048576).toFixed(0)}MiB ` +
        `(stage sums: get=${(worker.get_ms_sum / 1000).toFixed(1)}s ` +
        `transform=${(worker.transform_ms_sum / 1000).toFixed(1)}s)`,
    );
  }

  // server-side cost of filling staging (Path A: the whole transform;
  // Path B: just receiving the RowBinary INSERTs), this run only
  await chq(`SYSTEM FLUSH LOGS`);
  const logComment = {
    ch: "poc-chlb-transform-v2",
    rust: "poc-chlb-rust-insert",
  }[ENGINE];
  const stats = await chq(
    `SELECT
        count() AS queries,
        round(sum(query_duration_ms) / 1000, 2) AS wall_s,
        round(sum(ProfileEvents['OSCPUVirtualTimeMicroseconds']) / 1e6, 2) AS cpu_s,
        formatReadableSize(max(memory_usage)) AS peak_mem_per_query,
        formatReadableSize(sum(read_bytes)) AS read_bytes
     FROM system.query_log
     WHERE log_comment = '${logComment}' AND type = 'QueryFinish'
       AND event_time_microseconds >= fromUnixTimestamp64Milli(${runStarted})`,
    { json: true },
  );
  console.log(`server query_log (${logComment}):`, stats[0]);

  const sanity = await chq(
    `SELECT
        countDistinct(project_id) AS projects,
        sum(has_media) AS media_rows,
        countIf(match(trace_id, '^[0-9a-f]{32}$')) AS wellformed_trace_ids,
        min(start_time) AS min_start,
        max(start_time) AS max_start
     FROM poc_chlb.events_poc`,
    { json: true },
  );
  console.log("sanity:", sanity[0]);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
