// PoC harness: drives the ClickHouse-load-bearing loop per time-window batch:
//   TRUNCATE staging -> INSERT SELECT FROM s3(<window glob>) -> MOVE PARTITION -> timings
// Staging pool of 4; --concurrency N (default 1, max 4) pipelines windows.
//
// Usage: node harness.mjs [--concurrency N]
import { readFileSync } from "node:fs";

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

const sqlDir = new URL("./sql/", import.meta.url);
const outDir = new URL("./out/", import.meta.url);

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

async function setup() {
  // bootstrap: database may not exist yet, so run DDL without ?database
  const ddl = readFileSync(new URL("00_tables.sql", sqlDir), "utf8");
  for (const stmt of ddl
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const res = await fetch(CH.url, {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${CH.user}:${CH.password}`).toString("base64"),
      },
      body: stmt,
    });
    if (!res.ok) throw new Error(`DDL failed: ${await res.text()}`);
  }
}

const transformTemplate = readFileSync(
  new URL(process.env.POC_TRANSFORM_SQL ?? "transform-v2.sql", sqlDir),
  "utf8",
);

let s3Prefix = "otel-poc";
async function processWindow(windowId, slot) {
  const staging = `poc_chlb.events_poc_staging_${slot}`;
  const t0 = Date.now();

  await chq(`TRUNCATE TABLE ${staging}`);

  const url = `${S3_FROM_CH.base}/${s3Prefix}/*/${windowId}/*.json`;
  const insertSql = transformTemplate
    .replaceAll("{STAGING}", staging)
    .replaceAll("{URL}", url)
    .replaceAll("{S3_ACCESS_KEY}", S3_FROM_CH.accessKey)
    .replaceAll("{S3_SECRET_KEY}", S3_FROM_CH.secretKey);
  const tInsert0 = Date.now();
  await chq(insertSql);
  const insertMs = Date.now() - tInsert0;

  const [{ rows }] = await chq(
    `SELECT toUInt64(count()) AS rows FROM ${staging}`,
    { json: true },
  );

  const partitions = await chq(
    `SELECT partition_id FROM system.parts
     WHERE database = 'poc_chlb' AND table = 'events_poc_staging_${slot}' AND active
     GROUP BY partition_id`,
    { json: true },
  );
  const tMove0 = Date.now();
  for (const { partition_id } of partitions) {
    await chq(
      `ALTER TABLE ${staging} MOVE PARTITION ID '${partition_id}' TO TABLE poc_chlb.events_poc`,
    );
  }
  const moveMs = Date.now() - tMove0;

  return {
    windowId,
    rows: Number(rows),
    partitions: partitions.length,
    insertMs,
    moveMs,
    totalMs: Date.now() - t0,
  };
}

async function main() {
  await setup();
  const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", outDir), "utf8"),
  );

  s3Prefix = manifest.prefix ?? "otel-poc";
  console.log(
    `windows=${manifest.windows.length} concurrency=${CONCURRENCY} (staging pool slots)`,
  );
  const results = [];
  const queue = [...manifest.windows];
  const runStarted = Date.now();

  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, slot) =>
      (async () => {
        for (;;) {
          const w = queue.shift();
          if (!w) return;
          const r = await processWindow(w.windowId, slot);
          r.files = w.files;
          r.mb = w.bytes / 1e6;
          results.push(r);
          console.log(
            `${r.windowId} slot=${slot} files=${r.files} mb=${r.mb.toFixed(1)} rows=${r.rows} ` +
              `insert=${r.insertMs}ms move=${r.moveMs}ms total=${r.totalMs}ms ` +
              `(${(r.mb / (r.totalMs / 1000)).toFixed(1)} MB/s)`,
          );
        }
      })(),
    ),
  );
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

  // server-side cost of the transform inserts
  await chq(`SYSTEM FLUSH LOGS`);
  const stats = await chq(
    `SELECT
        count() AS queries,
        round(sum(query_duration_ms) / 1000, 2) AS wall_s,
        round(sum(ProfileEvents['OSCPUVirtualTimeMicroseconds']) / 1e6, 2) AS cpu_s,
        formatReadableSize(max(memory_usage)) AS peak_mem_per_query,
        formatReadableSize(sum(read_bytes)) AS read_bytes
     FROM system.query_log
     WHERE log_comment = 'poc-chlb-transform' AND type = 'QueryFinish'
       AND event_time > now() - INTERVAL 1 HOUR`,
    { json: true },
  );
  console.log("transform query_log:", stats[0]);

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
