// Order-independent per-column checksums of poc_chlb.events_poc, used to
// prove engine-vs-engine output parity (Path A ch vs Path B rust).
// event_ts is excluded: it is the insert-time clock in both engines.
//
// Usage: node checksum.mjs <label> [compareWith]
//   computes checksums, writes out/checksum-<label>.json;
//   with compareWith, diffs against out/checksum-<compareWith>.json and
//   exits 1 on any mismatch.
import { readFileSync, writeFileSync } from "node:fs";

const CH = {
  url: process.env.POC_CH_URL ?? "http://127.0.0.1:8123",
  user: process.env.POC_CH_USER ?? "clickhouse",
  password: process.env.POC_CH_PASSWORD ?? "clickhouse",
};

const COLUMNS = [
  "project_id",
  "trace_id",
  "span_id",
  "parent_span_id",
  "start_time",
  "end_time",
  "name",
  "type",
  "environment",
  "version",
  "release",
  "trace_name",
  "user_id",
  "session_id",
  "level",
  "status_message",
  "prompt_name",
  "prompt_version",
  "provided_model_name",
  "provided_usage_details",
  "usage_details",
  "input",
  "output",
  "metadata_names",
  "metadata_values",
  "source",
  "service_name",
  "service_version",
  "scope_name",
  "scope_version",
  "telemetry_sdk_language",
  "telemetry_sdk_name",
  "telemetry_sdk_version",
  "blob_storage_file_path",
  "event_bytes",
  "span_kind",
  "has_media",
  "media_manifest",
];

const [label, compareWith] = process.argv.slice(2);
if (!label) throw new Error("usage: node checksum.mjs <label> [compareWith]");

const exprs = COLUMNS.map(
  (c) =>
    `toUInt64(sum(cityHash64(coalesce(toString(${c}), '<NULL>')))) AS ${c}`,
);
const res = await fetch(`${CH.url}/?database=poc_chlb`, {
  method: "POST",
  headers: {
    Authorization:
      "Basic " + Buffer.from(`${CH.user}:${CH.password}`).toString("base64"),
  },
  body: `SELECT toUInt64(count()) AS __rows, ${exprs.join(", ")} FROM poc_chlb.events_poc FORMAT JSON`,
});
const text = await res.text();
if (!res.ok) throw new Error(`CH ${res.status}: ${text.slice(0, 2000)}`);
const [sums] = JSON.parse(text).data;

const outFile = new URL(`./out/checksum-${label}.json`, import.meta.url);
writeFileSync(outFile, JSON.stringify(sums, null, 2) + "\n");
console.log(`rows=${sums.__rows} -> ${outFile.pathname}`);

if (compareWith) {
  const other = JSON.parse(
    readFileSync(
      new URL(`./out/checksum-${compareWith}.json`, import.meta.url),
    ),
  );
  const diffs = ["__rows", ...COLUMNS].filter((c) => sums[c] !== other[c]);
  if (diffs.length) {
    console.error(`MISMATCH vs ${compareWith}: ${diffs.join(", ")}`);
    process.exit(1);
  }
  console.log(
    `PARITY: all ${COLUMNS.length} columns + row count identical to '${compareWith}' (event_ts excluded)`,
  );
}
