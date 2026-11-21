// Transfer-format bench: how should web-ingestion hand payloads to the worker?
//
// Packs the seeded corpus (today's stored shape: one JSON file per export
// request) into candidate transfer formats and measures bytes, object counts,
// and encode/pack cost:
//
//   baseline          one uncompressed JSON object per request (today)
//   per-request gz/zst today's objects, individually compressed (no batching)
//   json zip          raw payloads, zip archive (deflate PER ENTRY)
//   json tar.gz/.zst  raw payloads, solid-stream archive (cross-request dict)
//   proto .gz/.zst    payloads re-encoded as OTLP TracesData, length-framed,
//                     stream-compressed
//   parquet zstd/snappy  payloads flattened one-row-per-span (typed ids/times,
//                     attributes as JSON strings), written by clickhouse local
//
// Archive/framed/parquet objects target TARGET_MB compressed (the 16-32 MB
// band). Every format preserves per-request identity (member name / frame key /
// request-key column) and splits only at request boundaries.
//
// Verification: proto objects are fully decoded and probed against the source
// walk (span/attr counts, string bytes, id bytes, int64 sums); parquet objects
// are aggregated by ClickHouse against the same probe computed at row-write
// time; archives are checked by member count + summed member sizes.
//
// Usage: node transfer-bench.mjs [targetMB=24]
// Reads out/manifest.json for the corpus prefix; downloads to out/transfer-cache.
import {
  mkdirSync,
  existsSync,
  statSync,
  readFileSync,
  writeFileSync,
  createWriteStream,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import zlib from "node:zlib";
import protobuf from "protobufjs";
import { signedFetch } from "./sigv4.mjs";

const MINIO = {
  endpoint: process.env.POC_MINIO_ENDPOINT ?? "http://127.0.0.1:9090",
  bucket: process.env.POC_MINIO_BUCKET ?? "langfuse",
  accessKey: process.env.POC_MINIO_ACCESS_KEY ?? "minio",
  secretKey: process.env.POC_MINIO_SECRET_KEY ?? "miniosecret",
};
const TARGET_MB = Number(process.argv[2] ?? 24);
if (!(TARGET_MB >= 1)) {
  console.error(`targetMB must be >= 1, got "${process.argv[2]}"`);
  process.exit(1);
}
const TARGET = TARGET_MB * 1e6;

const here = (p) => new URL(p, import.meta.url).pathname;
const CACHE = here("./out/transfer-cache");
const WORK = here("./out/transfer-bench");
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const manifest = JSON.parse(readFileSync(here("./out/manifest.json"), "utf8"));
if (!manifest.complete) throw new Error("manifest is incomplete — regenerate");
const PREFIX = manifest.prefix;

// ---- helpers ---------------------------------------------------------------

function timed(fn) {
  const w0 = process.hrtime.bigint();
  const out = fn();
  return { out, wall: Number(process.hrtime.bigint() - w0) / 1e9 };
}

// pack steps are effectively single-threaded, so wall ~ CPU; good enough here
function sh(cmd, args, opts = {}) {
  const w0 = process.hrtime.bigint();
  execFileSync(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, COPYFILE_DISABLE: "1" },
    input: opts.input,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 1 << 28,
  });
  return { wall: Number(process.hrtime.bigint() - w0) / 1e9 };
}

const limiter = (max) => {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
};

const mb = (n) => (n / 1e6).toFixed(1);
const jsonSafe = (o) =>
  JSON.stringify(o, (k, v) => (typeof v === "bigint" ? v.toString() : v));

// ---- 0. list + download corpus ---------------------------------------------

function listCorpus() {
  const tsv = execFileSync(
    "clickhouse",
    [
      "local",
      "--query",
      `SELECT _path, _size FROM s3('${MINIO.endpoint}/${MINIO.bucket}/${PREFIX}/**/*.json', '${MINIO.accessKey}', '${MINIO.secretKey}', 'One') ORDER BY _path FORMAT TSV`,
    ],
    { encoding: "utf8", maxBuffer: 1 << 24 },
  );
  return tsv
    .trim()
    .split("\n")
    .map((l) => {
      const [path, size] = l.split("\t");
      return { path, size: Number(size) }; // path is bucket-prefixed
    });
}

async function download(files) {
  const limit = limiter(12);
  let fetched = 0;
  await Promise.all(
    files.map((f) =>
      limit(async () => {
        const local = join(CACHE, f.path);
        if (existsSync(local) && statSync(local).size === f.size) return;
        mkdirSync(dirname(local), { recursive: true });
        const r = await signedFetch({
          method: "GET",
          endpoint: MINIO.endpoint,
          path: `/${f.path}`,
          accessKey: MINIO.accessKey,
          secretKey: MINIO.secretKey,
        });
        if (!r.ok) throw new Error(`GET ${f.path} -> ${r.status}`);
        writeFileSync(local, Buffer.from(await r.arrayBuffer()));
        fetched++;
      }),
    ),
  );
  return fetched;
}

// ---- 1. normalize: both stored encodings -> canonical -----------------------

// ids: OTLP/JSON hex string | protobufjs-decoded {type:"Buffer",data:[...]}
function toIdBuffer(v, what) {
  if (typeof v === "string") return Buffer.from(v, "hex");
  if (v && v.type === "Buffer" && Array.isArray(v.data))
    return Buffer.from(v.data);
  throw new Error(`unrecognized id encoding for ${what}: ${JSON.stringify(v)}`);
}

// int64s: decimal string | protobufjs Long-like {low,high,unsigned}
function toBigInt64(v, what) {
  if (typeof v === "string") return BigInt(v);
  if (typeof v === "number") return BigInt(v);
  if (v && typeof v.low === "number" && typeof v.high === "number") {
    const raw = (BigInt(v.high) << 32n) | BigInt(v.low >>> 0);
    return v.unsigned ? BigInt.asUintN(64, raw) : BigInt.asIntN(64, raw);
  }
  throw new Error(
    `unrecognized int64 encoding for ${what}: ${JSON.stringify(v)}`,
  );
}

function canonicalValue(value, probe) {
  if ("stringValue" in value) {
    probe.strBytes += Buffer.byteLength(value.stringValue);
    return { stringValue: value.stringValue };
  }
  if ("intValue" in value) {
    const bi = toBigInt64(value.intValue, "intValue");
    probe.intSum = BigInt.asUintN(64, probe.intSum + bi);
    return { intValue: bi.toString() };
  }
  if ("doubleValue" in value) {
    probe.doubles++;
    return { doubleValue: value.doubleValue };
  }
  if ("boolValue" in value) return { boolValue: value.boolValue };
  throw new Error(`unrecognized AnyValue: ${JSON.stringify(value)}`);
}

function canonicalAttrs(attrs, probe) {
  return (attrs ?? []).map((a) => {
    probe.attrs++;
    return { key: a.key, value: canonicalValue(a.value, probe) };
  });
}

// resourceSpans array (the stored file shape) -> canonical TracesData object
function normalizeFile(resourceSpans, probe) {
  return {
    resourceSpans: resourceSpans.map((rs) => ({
      resource: { attributes: canonicalAttrs(rs.resource?.attributes, probe) },
      scopeSpans: (rs.scopeSpans ?? []).map((ss) => ({
        scope: { name: ss.scope?.name ?? "", version: ss.scope?.version ?? "" },
        spans: (ss.spans ?? []).map((sp) => {
          probe.spans++;
          const traceId = toIdBuffer(sp.traceId, "traceId");
          const spanId = toIdBuffer(sp.spanId, "spanId");
          if (sp.parentSpanId === undefined)
            throw new Error("corpus contract: parentSpanId always present");
          const parentSpanId = toIdBuffer(sp.parentSpanId, "parentSpanId");
          probe.idBytes += traceId.length + spanId.length + parentSpanId.length;
          const start = toBigInt64(sp.startTimeUnixNano, "startTimeUnixNano");
          const end = toBigInt64(sp.endTimeUnixNano, "endTimeUnixNano");
          probe.startSum = BigInt.asUintN(64, probe.startSum + start);
          return {
            traceId,
            spanId,
            parentSpanId,
            name: sp.name,
            kind: sp.kind ?? 0,
            startTimeUnixNano: start.toString(),
            endTimeUnixNano: end.toString(),
            attributes: canonicalAttrs(sp.attributes, probe),
            status: sp.status ?? {},
          };
        }),
      })),
    })),
  };
}

const newProbe = () => ({
  files: 0,
  spans: 0,
  attrs: 0,
  strBytes: 0,
  idBytes: 0,
  doubles: 0,
  intSum: 0n,
  startSum: 0n,
});

// probe a decoded protobufjs TracesData message. Decoded messages carry field
// DEFAULTS on the prototype ("" / 0), so oneof membership must be read from
// own properties, which protobufjs sets only for wire-present fields.
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function probeDecodedAttr(a, probe) {
  probe.attrs++;
  const v = a.value;
  if (hasOwn(v, "stringValue"))
    probe.strBytes += Buffer.byteLength(v.stringValue);
  else if (hasOwn(v, "intValue"))
    probe.intSum = BigInt.asUintN(
      64,
      probe.intSum + BigInt(v.intValue.toString()),
    );
  else if (hasOwn(v, "doubleValue")) probe.doubles++;
}
function probeDecodedTracesData(msg, probe) {
  for (const rs of msg.resourceSpans ?? []) {
    for (const a of rs.resource?.attributes ?? []) probeDecodedAttr(a, probe);
    for (const ss of rs.scopeSpans ?? []) {
      for (const sp of ss.spans ?? []) {
        probe.spans++;
        probe.idBytes +=
          sp.traceId.length + sp.spanId.length + sp.parentSpanId.length;
        probe.startSum = BigInt.asUintN(
          64,
          probe.startSum + BigInt(sp.startTimeUnixNano.toString()),
        );
        for (const a of sp.attributes ?? []) probeDecodedAttr(a, probe);
      }
    }
  }
}

// ---- proto framing -----------------------------------------------------------

function frame(key, msgBuf) {
  const keyBuf = Buffer.from(key, "utf8");
  const head = Buffer.alloc(8);
  head.writeUInt32LE(keyBuf.length, 0);
  head.writeUInt32LE(msgBuf.length, 4);
  return Buffer.concat([head, keyBuf, msgBuf]);
}

function* readFrames(buf) {
  let off = 0;
  while (off + 8 <= buf.length) {
    const keyLen = buf.readUInt32LE(off);
    const msgLen = buf.readUInt32LE(off + 4);
    const key = buf.toString("utf8", off + 8, off + 8 + keyLen);
    const msg = buf.subarray(off + 8 + keyLen, off + 8 + keyLen + msgLen);
    off += 8 + keyLen + msgLen;
    yield { key, msg };
  }
  if (off !== buf.length) throw new Error("trailing garbage in frame stream");
}

// ---- NDJSON row for parquet (one row per span) --------------------------------

// hand-assembled so UInt64 nanos are bare JSON integer tokens (ClickHouse
// parses them exactly; JSON.stringify cannot emit BigInt)
function spanRow(key, resJson, scope, sp, rowProbe) {
  const attrsJson = JSON.stringify(sp.attributes);
  rowProbe.rows++;
  rowProbe.kindSum += sp.kind;
  rowProbe.startSum = BigInt.asUintN(
    64,
    rowProbe.startSum + BigInt(sp.startTimeUnixNano),
  );
  rowProbe.attrsBytes += Buffer.byteLength(attrsJson);
  rowProbe.resBytes += Buffer.byteLength(resJson);
  rowProbe.idBytes += 32; // 16 + 8 + 8 after unhex
  return (
    `{"k":${JSON.stringify(key)}` +
    `,"res":${JSON.stringify(resJson)}` +
    `,"sn":${JSON.stringify(scope.name)}` +
    `,"sv":${JSON.stringify(scope.version)}` +
    `,"tid":"${sp.traceId.toString("hex")}"` +
    `,"sid":"${sp.spanId.toString("hex")}"` +
    `,"pid":"${sp.parentSpanId.toString("hex")}"` +
    `,"name":${JSON.stringify(sp.name)}` +
    `,"kind":${sp.kind}` +
    `,"start":${sp.startTimeUnixNano}` +
    `,"end":${sp.endTimeUnixNano}` +
    `,"code":${sp.status?.code ?? 0}` +
    `,"msg":${JSON.stringify(sp.status?.message ?? "")}` +
    `,"attrs":${JSON.stringify(attrsJson)}}\n`
  );
}

const NDJSON_SCHEMA =
  "k String, res String, sn String, sv String, tid String, sid String, " +
  "pid String, name String, kind UInt8, start UInt64, end UInt64, " +
  "code UInt8, msg String, attrs String";

const PARQUET_SELECT =
  "SELECT k, res, sn, sv, toFixedString(unhex(tid), 16) AS tid, " +
  "toFixedString(unhex(sid), 8) AS sid, toFixedString(unhex(pid), 8) AS pid, " +
  "name, kind, start, end, code, msg, attrs";

function writeParquet(ndjsonPath, outPath, codec) {
  const q =
    `${PARQUET_SELECT} FROM file('${ndjsonPath}', 'JSONEachRow', '${NDJSON_SCHEMA}') ` +
    `INTO OUTFILE '${outPath}' TRUNCATE FORMAT Parquet ` +
    `SETTINGS output_format_parquet_compression_method='${codec}'`;
  return sh("clickhouse", ["local", "--query", q]);
}

// ---- chunking -----------------------------------------------------------------

// greedy split in corpus order; splits only at item boundaries
function partitionByBudget(items, sizeOf, inputBudget) {
  const groups = [[]];
  let acc = 0;
  for (const it of items) {
    if (acc > 0 && acc + sizeOf(it) > inputBudget) {
      groups.push([]);
      acc = 0;
    }
    groups[groups.length - 1].push(it);
    acc += sizeOf(it);
  }
  return groups.filter((g) => g.length > 0);
}

// ---- main ----------------------------------------------------------------------

async function main() {
  console.log(`corpus prefix: ${PREFIX}, object target ${TARGET_MB} MB`);
  const files = listCorpus();
  const totalRaw = files.reduce((a, f) => a + f.size, 0);
  console.log(`listed ${files.length} files, ${mb(totalRaw)} MB raw`);
  const fetched = await download(files);
  console.log(`downloaded ${fetched} (rest cached)`);

  // load OTLP schema
  const root = new protobuf.Root();
  root.resolvePath = (origin, target) =>
    target.startsWith("opentelemetry/") ? here(`./proto/${target}`) : target;
  await root.load(here("./proto/opentelemetry/proto/trace/v1/trace.proto"));
  const TracesData = root.lookupType("opentelemetry.proto.trace.v1.TracesData");

  // ---- pass 1: parse, normalize, proto-encode, rows, per-file compress ----
  const srcProbe = newProbe();
  const rowProbe = {
    rows: 0,
    kindSum: 0,
    startSum: 0n,
    attrsBytes: 0,
    resBytes: 0,
    idBytes: 0,
  };
  const framesPath = join(WORK, "frames.bin");
  const rowsPath = join(WORK, "rows.ndjson");
  const framesOut = createWriteStream(framesPath);
  const rowsOut = createWriteStream(rowsPath);
  const frameMeta = []; // {key, len}
  const rowMeta = []; // {key, len} (ndjson bytes)
  let perFileGz = 0;
  let perFileZst = 0;
  const t = { read: 0, parse: 0, normalize: 0, proto: 0, rows: 0, perfile: 0 };

  for (const f of files) {
    srcProbe.files++;
    const local = join(CACHE, f.path);
    const key = f.path.slice(`${MINIO.bucket}/`.length);

    const r1 = timed(() => readFileSync(local));
    t.read += r1.wall;
    const raw = r1.out;

    const r2 = timed(() => JSON.parse(raw));
    t.parse += r2.wall;

    const r3 = timed(() => normalizeFile(r2.out, srcProbe));
    t.normalize += r3.wall;
    const canonical = r3.out;

    // no TracesData.verify here: it rejects decimal-string int64s that
    // fromObject converts fine; the decode+probe pass below is the real check
    const r4 = timed(() =>
      TracesData.encode(TracesData.fromObject(canonical)).finish(),
    );
    t.proto += r4.wall;
    const framed = frame(key, r4.out);
    framesOut.write(framed);
    frameMeta.push({ key, len: framed.length });

    const r5 = timed(() => {
      let bytes = 0;
      const chunks = [];
      for (const rs of canonical.resourceSpans) {
        const resJson = JSON.stringify(rs.resource.attributes);
        for (const ss of rs.scopeSpans) {
          for (const sp of ss.spans) {
            const line = spanRow(key, resJson, ss.scope, sp, rowProbe);
            chunks.push(line);
            bytes += Buffer.byteLength(line);
          }
        }
      }
      rowsOut.write(chunks.join(""));
      return bytes;
    });
    t.rows += r5.wall;
    rowMeta.push({ key, len: r5.out });

    const r6 = timed(() => {
      perFileGz += zlib.gzipSync(raw).length;
      perFileZst += zlib.zstdCompressSync(raw).length;
    });
    t.perfile += r6.wall;
  }
  await new Promise((res) => framesOut.end(res));
  await new Promise((res) => rowsOut.end(res));
  const framesBytes = statSync(framesPath).size;
  const rowsBytes = statSync(rowsPath).size;
  console.log(
    `pass 1 done: spans=${srcProbe.spans} attrs=${srcProbe.attrs} ` +
      `frames=${mb(framesBytes)} MB rows=${mb(rowsBytes)} MB\n` +
      `  read ${t.read.toFixed(1)}s parse ${t.parse.toFixed(1)}s ` +
      `normalize ${t.normalize.toFixed(1)}s proto-encode ${t.proto.toFixed(1)}s ` +
      `rows-write ${t.rows.toFixed(1)}s perfile-compress ${t.perfile.toFixed(1)}s`,
  );

  const results = [];
  const addResult = (name, objects, packWall, note = "") => {
    const sizes = objects.map((o) => o.bytes);
    const total = sizes.reduce((a, b) => a + b, 0);
    results.push({
      name,
      objects: objects.length,
      totalBytes: total,
      ratio: totalRaw / total,
      minMB: Math.min(...sizes) / 1e6,
      maxMB: Math.max(...sizes) / 1e6,
      packWall,
      note,
    });
  };

  results.push({
    name: "baseline (today)",
    objects: files.length,
    totalBytes: totalRaw,
    ratio: 1,
    minMB: Math.min(...files.map((f) => f.size)) / 1e6,
    maxMB: Math.max(...files.map((f) => f.size)) / 1e6,
    packWall: 0,
    note: "1 uncompressed JSON object per request",
  });
  results.push({
    name: "per-request gzip",
    objects: files.length,
    totalBytes: perFileGz,
    ratio: totalRaw / perFileGz,
    minMB: NaN,
    maxMB: NaN,
    packWall: t.perfile,
    note: "no batching",
  });
  results.push({
    name: "per-request zstd",
    objects: files.length,
    totalBytes: perFileZst,
    ratio: totalRaw / perFileZst,
    minMB: NaN,
    maxMB: NaN,
    packWall: t.perfile,
    note: "no batching",
  });

  // ---- archives of raw payloads ----
  // one global pass calibrates the input budget per flavor, then pack groups
  const listAllPath = join(WORK, "list-all.txt");
  writeFileSync(listAllPath, files.map((f) => f.path).join("\n") + "\n");
  const tarPack = (flags) => (listPath, out) =>
    sh("tar", [...flags, "-cf", out, "-C", CACHE, "-T", listPath]);
  const zipPack = (listPath, out) =>
    sh("zip", ["-q", "-X", out, "-@"], {
      cwd: CACHE,
      input: readFileSync(listPath),
    });
  const flavors = [
    {
      name: "json zip (deflate/entry)",
      ext: "zip",
      pack: zipPack,
      note: "no cross-request dictionary",
    },
    {
      name: "json tar.gz",
      ext: "tar.gz",
      pack: tarPack(["-z"]),
      note: "solid stream",
    },
    {
      name: "json tar.zst",
      ext: "tar.zst",
      pack: tarPack(["--zstd"]),
      note: "solid stream",
    },
  ];
  for (const fl of flavors) {
    const globalOut = join(WORK, `global.${fl.ext}`);
    fl.pack(listAllPath, globalOut);
    const globalSize = statSync(globalOut).size;
    rmSync(globalOut);
    const budget = TARGET * (totalRaw / globalSize);
    const groups = partitionByBudget(files, (f) => f.size, budget);
    const dir = join(WORK, fl.ext.replaceAll(".", "-"));
    mkdirSync(dir, { recursive: true });
    let wall = 0;
    const objects = [];
    groups.forEach((g, i) => {
      const out = join(dir, `obj-${String(i).padStart(3, "0")}.${fl.ext}`);
      const listPath = join(dir, `list-${i}.txt`);
      writeFileSync(listPath, g.map((f) => f.path).join("\n") + "\n");
      wall += fl.pack(listPath, out).wall;
      rmSync(listPath);
      objects.push({ path: out, bytes: statSync(out).size, members: g.length });
    });
    addResult(fl.name, objects, wall, fl.note);

    // verify: member counts and summed member sizes
    let members = 0;
    let memberBytes = 0;
    for (const o of objects) {
      if (fl.ext === "zip") {
        const out = execFileSync("unzip", ["-l", o.path], { encoding: "utf8" });
        const totals = out.trim().split("\n").at(-1).trim().split(/\s+/);
        memberBytes += Number(totals[0]);
        members += Number(totals[1]);
      } else {
        const out = execFileSync(
          "tar",
          [fl.ext === "tar.zst" ? "--zstd" : "-z", "-tvf", o.path],
          { encoding: "utf8", maxBuffer: 1 << 24 },
        );
        const lines = out.trim().split("\n");
        members += lines.length;
        memberBytes += lines.reduce(
          (a, l) => a + Number(l.trim().split(/\s+/)[4]),
          0,
        );
      }
    }
    if (members !== files.length || memberBytes !== totalRaw)
      throw new Error(
        `${fl.name} verify failed: members=${members}/${files.length} bytes=${memberBytes}/${totalRaw}`,
      );
    console.log(
      `${fl.name}: verified ${members} members, ${mb(memberBytes)} MB`,
    );
  }
  rmSync(listAllPath);

  // ---- proto frames, stream-compressed ----
  const framesBuf = readFileSync(framesPath);
  for (const codec of [
    { name: "proto frames gzip", ext: "pb.gz", fn: (b) => zlib.gzipSync(b) },
    {
      name: "proto frames zstd",
      ext: "pb.zst",
      fn: (b) => zlib.zstdCompressSync(b),
    },
  ]) {
    const globalSize = codec.fn(framesBuf).length;
    const budget = TARGET * (framesBytes / globalSize);
    const groups = partitionByBudget(frameMeta, (m) => m.len, budget);
    const dir = join(WORK, codec.ext.replaceAll(".", "-"));
    mkdirSync(dir, { recursive: true });
    let wall = 0;
    const objects = [];
    let off = 0;
    // groups follow frameMeta order, so slices are contiguous
    groups.forEach((g, i) => {
      const len = g.reduce((a, m) => a + m.len, 0);
      const slice = framesBuf.subarray(off, off + len);
      off += len;
      const r = timed(() => codec.fn(slice));
      wall += r.wall;
      const out = join(dir, `obj-${String(i).padStart(3, "0")}.${codec.ext}`);
      writeFileSync(out, r.out);
      objects.push({ path: out, bytes: r.out.length, members: g.length });
    });
    addResult(codec.name, objects, wall, "TracesData, length-framed");

    // verify: decode every frame in every object, probe must match source
    const vProbe = newProbe();
    let vFiles = 0;
    for (const o of objects) {
      const plain =
        codec.ext === "pb.gz"
          ? zlib.gunzipSync(readFileSync(o.path))
          : zlib.zstdDecompressSync(readFileSync(o.path));
      for (const { msg } of readFrames(plain)) {
        vFiles++;
        probeDecodedTracesData(TracesData.decode(msg), vProbe);
      }
    }
    const ok =
      vFiles === files.length &&
      vProbe.spans === srcProbe.spans &&
      vProbe.attrs === srcProbe.attrs &&
      vProbe.strBytes === srcProbe.strBytes &&
      vProbe.idBytes === srcProbe.idBytes &&
      vProbe.intSum === srcProbe.intSum &&
      vProbe.startSum === srcProbe.startSum;
    if (!ok)
      throw new Error(
        `${codec.name} verify failed: ${jsonSafe({ vFiles, vProbe })} vs ${jsonSafe(srcProbe)}`,
      );
    console.log(`${codec.name}: verified ${vFiles} frames, probes match`);
  }

  // ---- parquet ----
  const rowsBuf = readFileSync(rowsPath);
  for (const codec of ["zstd", "snappy"]) {
    const globalOut = join(WORK, `global-${codec}.parquet`);
    writeParquet(rowsPath, globalOut, codec);
    const globalSize = statSync(globalOut).size;
    rmSync(globalOut);
    const budget = TARGET * (rowsBytes / globalSize);
    const groups = partitionByBudget(rowMeta, (m) => m.len, budget);
    const dir = join(WORK, `parquet-${codec}`);
    mkdirSync(dir, { recursive: true });
    let wall = 0;
    const objects = [];
    let off = 0;
    groups.forEach((g, i) => {
      const len = g.reduce((a, m) => a + m.len, 0);
      const slicePath = join(dir, `slice-${i}.ndjson`);
      writeFileSync(slicePath, rowsBuf.subarray(off, off + len));
      off += len;
      const out = join(dir, `obj-${String(i).padStart(3, "0")}.parquet`);
      wall += writeParquet(slicePath, out, codec).wall;
      rmSync(slicePath);
      objects.push({ path: out, bytes: statSync(out).size, members: g.length });
    });
    addResult(`parquet ${codec}`, objects, wall, "one row per span");

    // verify: ClickHouse aggregates over the written objects vs row probe
    const agg = JSON.parse(
      execFileSync(
        "clickhouse",
        [
          "local",
          "--query",
          `SELECT count() AS rows, sum(kind) AS kindSum, sum(start) AS startSum, ` +
            `sum(length(attrs)) AS attrsBytes, sum(length(res)) AS resBytes, ` +
            `sum(length(tid) + length(sid) + length(pid)) AS idBytes ` +
            `FROM file('${dir}/obj-*.parquet', 'Parquet') FORMAT JSONEachRow ` +
            // quote 64-bit ints or JSON.parse rounds startSum through a double
            `SETTINGS output_format_json_quote_64bit_integers=1`,
        ],
        { encoding: "utf8" },
      ),
    );
    const ok =
      Number(agg.rows) === rowProbe.rows &&
      Number(agg.kindSum) === rowProbe.kindSum &&
      BigInt(agg.startSum) === rowProbe.startSum &&
      Number(agg.attrsBytes) === rowProbe.attrsBytes &&
      Number(agg.resBytes) === rowProbe.resBytes &&
      Number(agg.idBytes) === rowProbe.idBytes;
    if (!ok)
      throw new Error(
        `parquet ${codec} verify failed: ${JSON.stringify(agg)} vs ${jsonSafe(rowProbe)}`,
      );
    console.log(`parquet ${codec}: verified ${agg.rows} rows, probes match`);
  }

  // ---- report ----
  console.log(
    `\nFYI uncompressed intermediates: proto frames ${mb(framesBytes)} MB ` +
      `(${(totalRaw / framesBytes).toFixed(2)}x vs raw JSON), ` +
      `span rows NDJSON ${mb(rowsBytes)} MB`,
  );
  console.log(
    `\n| format | objects | total MB | ratio | obj MB (min-max) | pack wall s | note |`,
  );
  console.log(`|---|---|---|---|---|---|---|`);
  for (const r of results) {
    const range = Number.isNaN(r.minMB)
      ? "per request"
      : `${r.minMB.toFixed(1)}-${r.maxMB.toFixed(1)}`;
    console.log(
      `| ${r.name} | ${r.objects} | ${mb(r.totalBytes)} | ${r.ratio.toFixed(1)}x | ${range} | ${r.packWall.toFixed(1)} | ${r.note} |`,
    );
  }
  writeFileSync(
    here("./out/transfer-bench-results.json"),
    JSON.stringify(
      {
        prefix: PREFIX,
        targetMB: TARGET_MB,
        totalRaw,
        files: files.length,
        spans: srcProbe.spans,
        pass1: t,
        framesBytes,
        rowsBytes,
        results,
      },
      (k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ) + "\n",
  );
  console.log(`\nresults written to out/transfer-bench-results.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
