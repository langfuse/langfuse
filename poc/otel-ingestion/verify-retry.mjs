// Simulates the worst-case crash: INSERT into staging succeeded, process died
// before MOVE. The retry loop (truncate -> insert -> move) must land exactly
// one copy in the target.
import { readFileSync } from "node:fs";
const manifest = JSON.parse(
  readFileSync(new URL("./out/manifest.json", import.meta.url), "utf8"),
);

const CH = {
  url: process.env.POC_CH_URL ?? "http://127.0.0.1:8123",
  user: process.env.POC_CH_USER ?? "clickhouse",
  password: process.env.POC_CH_PASSWORD ?? "clickhouse",
};
const S3_BASE = process.env.POC_CH_S3_BASE ?? "http://minio:9000/langfuse";

async function chq(sql, { json = false } = {}) {
  const res = await fetch(CH.url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${CH.user}:${CH.password}`).toString("base64"),
    },
    body: json ? `${sql} FORMAT JSON` : sql,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`CH ${res.status}: ${text.slice(0, 1500)}`);
  return json ? JSON.parse(text).data : text;
}

const template = readFileSync(
  new URL("./engine-ch/sql/transform-v2.sql", import.meta.url),
  "utf8",
);
const insertSql = template
  .replaceAll("{STAGING}", "poc_chlb.events_poc_staging_0")
  .replaceAll(
    "{URL}",
    `${S3_BASE}/${manifest.prefix ?? "otel-poc"}/*/w0000/*.json`,
  )
  .replaceAll("{S3_ACCESS_KEY}", process.env.POC_MINIO_ACCESS_KEY ?? "minio")
  .replaceAll(
    "{S3_SECRET_KEY}",
    process.env.POC_MINIO_SECRET_KEY ?? "miniosecret",
  );

const count = async (table) =>
  Number((await chq(`SELECT count() AS c FROM ${table}`, { json: true }))[0].c);

await chq(`TRUNCATE TABLE poc_chlb.events_poc`);
await chq(`TRUNCATE TABLE poc_chlb.events_poc_staging_0`);

// attempt 1: insert succeeds, then "crash" (no MOVE)
await chq(insertSql);
const staged1 = await count("poc_chlb.events_poc_staging_0");
console.log(
  `attempt 1: staged=${staged1}, crash before MOVE (target=${await count("poc_chlb.events_poc")})`,
);

// attempt 2: full retry loop
await chq(`TRUNCATE TABLE poc_chlb.events_poc_staging_0`);
await chq(insertSql);
const staged2 = await count("poc_chlb.events_poc_staging_0");
const parts = await chq(
  `SELECT partition_id FROM system.parts
   WHERE database='poc_chlb' AND table='events_poc_staging_0' AND active GROUP BY partition_id`,
  { json: true },
);
for (const { partition_id } of parts) {
  await chq(
    `ALTER TABLE poc_chlb.events_poc_staging_0 MOVE PARTITION ID '${partition_id}' TO TABLE poc_chlb.events_poc`,
  );
}
const target = await count("poc_chlb.events_poc");
const stagingAfter = await count("poc_chlb.events_poc_staging_0");

console.log(
  `attempt 2: staged=${staged2}, moved -> target=${target}, staging after move=${stagingAfter}`,
);
const dupes = Number(
  (
    await chq(
      `SELECT count() AS c FROM (SELECT span_id FROM poc_chlb.events_poc GROUP BY span_id HAVING count() > 1)`,
      { json: true },
    )
  )[0].c,
);
console.log(
  target === staged2 && dupes === 0 && stagingAfter === 0
    ? `PASS: exactly one copy (${target} rows), 0 duplicate span_ids, staging drained`
    : `FAIL: target=${target} staged=${staged2} dupes=${dupes} stagingAfter=${stagingAfter}`,
);
