// Mini-uploader: proves the SQL-produced media manifest is actionable.
// Takes N manifest entries from ClickHouse, re-reads the RAW file from MinIO,
// locates the span/field, slices [byte_offset, byte_offset+byte_length),
// decodes the data URI and checks SHA-256 -> media_id and content type match.
// (A real uploader would PUT the decoded bytes to the media bucket here.)
import { createHash } from "node:crypto";
import { signedFetch } from "./sigv4.mjs";

const CH = {
  url: process.env.POC_CH_URL ?? "http://127.0.0.1:8123",
  user: process.env.POC_CH_USER ?? "clickhouse",
  password: process.env.POC_CH_PASSWORD ?? "clickhouse",
};
const MINIO = {
  endpoint: process.env.POC_MINIO_ENDPOINT ?? "http://127.0.0.1:9090",
  bucket: process.env.POC_MINIO_BUCKET ?? "langfuse",
  accessKey: process.env.POC_MINIO_ACCESS_KEY ?? "minio",
  secretKey: process.env.POC_MINIO_SECRET_KEY ?? "miniosecret",
};
const SAMPLE = Number(process.argv[2] ?? 25);

async function chq(sql) {
  const res = await fetch(CH.url, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${CH.user}:${CH.password}`).toString("base64"),
    },
    body: `${sql} FORMAT JSON`,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`CH ${res.status}: ${text.slice(0, 1500)}`);
  return JSON.parse(text).data;
}

const parseId = (v) =>
  typeof v === "string" ? v : Buffer.from(v.data ?? v).toString("hex");
const urlsafeSha256 = (buf) =>
  createHash("sha256")
    .update(buf)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_");

// the uploader work list, straight off the manifest column
const workList = await chq(`
  SELECT blob_storage_file_path AS source_file, span_id, input,
         m.media_id AS media_id, m.content_type AS content_type,
         m.field AS field, m.byte_offset AS byte_offset, m.byte_length AS byte_length
  FROM poc_chlb.events_poc
  ARRAY JOIN media_manifest AS m
  ORDER BY rand()
  LIMIT ${SAMPLE}
`);
console.log(`work list sample: ${workList.length} media items`);

let pass = 0;
const fileCache = new Map();
for (const item of workList) {
  // 1. rewritten payload must carry the token and no residual data URI
  const token = `@@@langfuseMedia:type=${item.content_type}|id=${item.media_id}|source=base64_data_uri@@@`;
  if (!item.input.includes(token))
    throw new Error(`token missing for ${item.media_id}`);
  if (/data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,/.test(item.input))
    throw new Error(`residual data URI in rewritten input (${item.span_id})`);

  // 2. fetch raw file (source_file is the s3 _path, bucket-prefixed or not)
  const path = item.source_file.startsWith(`${MINIO.bucket}/`)
    ? `/${item.source_file}`
    : `/${MINIO.bucket}/${item.source_file}`;
  if (!fileCache.has(path)) {
    const res = await signedFetch({
      method: "GET",
      endpoint: MINIO.endpoint,
      path,
      ...MINIO,
    });
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    fileCache.set(path, JSON.parse(await res.text()));
  }
  const resourceSpans = fileCache.get(path);

  // 3. locate span + field value (decoded attribute string)
  let value;
  outer: for (const rs of resourceSpans) {
    for (const ss of rs.scopeSpans ?? []) {
      for (const sp of ss.spans ?? []) {
        if (parseId(sp.spanId) === item.span_id) {
          value = sp.attributes.find(
            (a) => a.key === `langfuse.observation.${item.field}`,
          )?.value?.stringValue;
          break outer;
        }
      }
    }
  }
  if (value == null)
    throw new Error(`span ${item.span_id} not found in ${path}`);

  // 4. slice at manifest offsets, decode, hash, compare
  const off = Number(item.byte_offset);
  const len = Number(item.byte_length);
  const slice = value.slice(off, off + len);
  if (!slice.startsWith("data:"))
    throw new Error(
      `offset ${off} does not hit a data URI (got: ${slice.slice(0, 30)}...)`,
    );
  const m = slice.match(/^data:([^;]+);base64,(.*)$/s);
  if (m[1] !== item.content_type)
    throw new Error(`content type mismatch: ${m[1]} vs ${item.content_type}`);
  const decoded = Buffer.from(m[2], "base64");
  const id = urlsafeSha256(decoded);
  if (id !== item.media_id)
    throw new Error(`media_id mismatch: ${id} vs ${item.media_id}`);
  pass += 1;
}

console.log(
  `PASS: ${pass}/${workList.length} manifest entries verified end-to-end ` +
    `(offset hit, content type, SHA-256 media_id) across ${fileCache.size} raw files`,
);
