/**
 * Node bench for the lazy UTF-8 JSON byte indexer (LFE-11082).
 *
 * Run with a recent Node (>= 22.6, native TS type-stripping). `web` is a
 * CommonJS package, so Node prints a one-line "reparsing as ES module" notice
 * and runs it as ESM — harmless for a dev script:
 *
 *   SCRATCH=/tmp/lfe-11082 node \
 *     web/src/components/ui/AdvancedJsonViewer/lazy/benchByteJsonIndex.ts
 *
 * (It is a .ts, not .mts, only because this repo's concurrent ESLint crashes
 * on function-type annotations in .mts files; the engine itself is unaffected.)
 *
 * It generates two payloads in SCRATCH (a ~200MB structured array and a ~2M
 * element wide array), then proves the core property: the FIRST childrenPage
 * on a container pays a one-time O(container) scan, but the 2nd and 3rd pages
 * are O(page) because the child-offset table is cached — unlike big-json-viewer
 * which re-walks the container (~470ms) on every page. It also reports peak RSS
 * vs a JSON.parse baseline.
 *
 * Each scenario runs in its own child process so peak RSS is measured cleanly
 * (no cross-contamination between the indexer and the JSON.parse baseline).
 */

import { spawnSync } from "node:child_process";
import {
  closeSync,
  openSync,
  readFileSync,
  statSync,
  writeSync,
} from "node:fs";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
// Type-only import (erased at runtime); the value import is the computed
// dynamic import() below so Node can type-strip the .ts target at load time.
import type { ByteJsonIndexEngine } from "./byteJsonIndex";

type Mod = { ByteJsonIndexEngine: typeof ByteJsonIndexEngine };

const SCRATCH =
  process.env.SCRATCH ??
  "/private/tmp/claude-501/-Users-nikita-code-langfuse-pc81/b41a602e-c1b1-424d-982b-7efdba51f3ca/scratchpad";

const STRUCTURED_TARGET_BYTES = Number(
  process.env.STRUCTURED_BYTES ?? 200 * 1024 * 1024,
);
const WIDE_COUNT = Number(process.env.WIDE_COUNT ?? 2_000_000);
const BLOB_BYTES = 4 * 1024 * 1024; // large-value target inside record 0

const structuredPath = join(SCRATCH, "structured-200mb.json");
const widePath = join(SCRATCH, "wide-2m.json");

const MB = 1024 * 1024;
const fmtMB = (n: number) => `${(n / MB).toFixed(1)}MB`;
const fmtMs = (n: number) => `${n.toFixed(3)}ms`;

async function loadModule(): Promise<Mod> {
  const url = new URL("./byteJsonIndex.ts", import.meta.url).href;
  // Computed specifier => TS types this as any; cast back to the module type.
  return (await import(url)) as Mod;
}

// ---------------------------------------------------------------------------
// Payload generation (streamed to disk; never builds the whole doc in memory)
// ---------------------------------------------------------------------------

function generateStructured(path: string, targetBytes: number): void {
  if (existsSync(path) && statSync(path).size >= targetBytes * 0.98) return;
  const fd = openSync(path, "w");
  try {
    let written = 0;
    const write = (s: string) => {
      written += writeSync(fd, s);
    };
    write("[");
    let buf = "";
    let i = 0;
    let first = true;
    while (written + buf.length < targetBytes) {
      const prefix = first ? "" : ",";
      first = false;
      const blob = i === 0 ? `,"blob":"${"x".repeat(BLOB_BYTES)}"` : "";
      buf +=
        `${prefix}{"id":${i},"uuid":"0f1e2d3c4b5a69788796a5b4c3d2e1f0",` +
        `"name":"user_${i}","email":"user${i}@example.com","active":${
          i % 2 === 0
        },"score":0.12345678901234567890123,"balance":9007199254740993,` +
        `"tags":["alpha","beta","gamma"],"profile":{"age":${
          20 + (i % 60)
        },"city":"Springfield","prefs":{"theme":"dark","lang":"en"}},` +
        `"note":"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt."${blob}}`;
      i++;
      if (buf.length >= 4 * MB) {
        write(buf);
        buf = "";
      }
    }
    if (buf.length) write(buf);
    write("]");
  } finally {
    closeSync(fd);
  }
}

function generateWide(path: string, count: number): void {
  if (existsSync(path)) return;
  const fd = openSync(path, "w");
  try {
    writeSync(fd, "[");
    let buf = "";
    for (let i = 0; i < count; i++) {
      buf += i === 0 ? String(i) : "," + i;
      if (buf.length >= 4 * MB) {
        writeSync(fd, buf);
        buf = "";
      }
    }
    if (buf.length) writeSync(fd, buf);
    writeSync(fd, "]");
  } finally {
    closeSync(fd);
  }
}

// ---------------------------------------------------------------------------
// Peak-RSS sampler
// ---------------------------------------------------------------------------

function startRssSampler(): () => number {
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peak) peak = rss;
  }, 10);
  timer.unref();
  return () => {
    clearInterval(timer);
    const rss = process.memoryUsage().rss;
    return Math.max(peak, rss);
  };
}

function time<T>(fn: () => T): { ms: number; value: T } {
  const t0 = performance.now();
  const value = fn();
  return { ms: performance.now() - t0, value };
}

// ---------------------------------------------------------------------------
// Child roles (one scenario per process => clean peak RSS)
// ---------------------------------------------------------------------------

interface RoleResult {
  role: string;
  fileBytes: number;
  peakRssBytes: number;
  metrics: Record<string, unknown>;
  error?: string;
}

async function runIndexerRole(
  path: string,
  wide: boolean,
): Promise<RoleResult> {
  const stopSampler = startRssSampler();
  const fileBytes = statSync(path).size;
  const mod = await loadModule();
  // Alias the Buffer's ArrayBuffer (no copy) so RSS stays ~1x the file.
  const buf = readFileSync(path);
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

  const metrics: Record<string, unknown> = {};

  const engine = new mod.ByteJsonIndexEngine();
  const loaded = time(() => engine.load(bytes));
  metrics.loadMs = loaded.ms;
  metrics.rootType = loaded.value.type;

  // The whole point: 3 consecutive childrenPage(root, 0, 100). Page 1 scans &
  // caches the container; pages 2 and 3 slice the cached table.
  const root = loaded.value;
  const pageTimings: number[] = [];
  let firstPage: ReturnType<typeof engine.childrenPage> | null = null;
  for (let k = 0; k < 3; k++) {
    const p = time(() => engine.childrenPage(root.nodeId, 0, 100));
    pageTimings.push(p.ms);
    if (k === 0) firstPage = p.value;
  }
  metrics.childrenPage_x3_ms = pageTimings;
  metrics.total = firstPage!.total;
  metrics.rootChildCount = engine.describeNode(root.nodeId).childCount;

  if (wide) {
    const total = firstPage!.total;
    const mid = time(() =>
      engine.childrenPage(root.nodeId, Math.floor(total / 2), 100),
    );
    const last = time(() =>
      engine.childrenPage(root.nodeId, Math.max(0, total - 100), 100),
    );
    metrics.midPageMs = mid.ms;
    metrics.lastPageMs = last.ms;
    metrics.midFirstIndex = mid.value.children[0]?.index;
    metrics.lastFirstIndex = last.value.children[0]?.index;
    // Prove random access lands on the right element.
    const midNode = mid.value.children[0];
    metrics.midValue = engine.getValue(midNode.nodeId).value;

    // getValue on a small leaf.
    const small = time(() => engine.getValue(firstPage!.children[0].nodeId));
    metrics.smallValue = small.value.value;
    metrics.getValueSmallMs = small.ms;
  } else {
    // Structured: descend into record 0 and read a small leaf + a large value.
    const rec0 = firstPage!.children[0];
    const rec0Page = engine.childrenPage(rec0.nodeId, 0, 100);
    const idNode = rec0Page.children.find((c) => c.key === "id");
    const blobNode = rec0Page.children.find((c) => c.key === "blob");
    const balanceNode = rec0Page.children.find((c) => c.key === "balance");
    const scoreNode = rec0Page.children.find((c) => c.key === "score");

    if (idNode) {
      const small = time(() => engine.getValue(idNode.nodeId));
      metrics.smallValue = small.value.value;
      metrics.getValueSmallMs = small.ms;
    }
    // Precision proofs on real generated data.
    if (balanceNode) {
      const r = engine.getValue(balanceNode.nodeId);
      metrics.balance = String(r.value);
      metrics.balanceIsBigInt = typeof r.value === "bigint";
      metrics.balanceLossy = r.lossyNumber;
    }
    if (scoreNode) {
      const r = engine.getValue(scoreNode.nodeId);
      metrics.score = r.value;
      metrics.scoreLossy = r.lossyNumber;
    }
    // Large value: decode a ~4MB string via TextDecoder (must not throw).
    if (blobNode) {
      const large = time(() =>
        engine.getValue(blobNode.nodeId, 16 * 1024 * 1024),
      );
      metrics.largeValueBytes = large.value.byteLength;
      metrics.largeValueLen = (large.value.value as string).length;
      metrics.largeValueTruncated = large.value.truncated;
      metrics.getValueLargeMs = large.ms;
    }
    // Demonstrate the maxBytes safety cap on the whole-doc root (no OOM).
    const capped = engine.getValue(root.nodeId, 1 * MB);
    metrics.rootCappedTruncated = capped.truncated;
    metrics.rootCappedReturnedLen = (capped.value as string).length;
  }

  return {
    role: wide ? "indexer:wide" : "indexer:structured",
    fileBytes,
    peakRssBytes: stopSampler(),
    metrics,
  };
}

function runJsonParseRole(path: string): RoleResult {
  const stopSampler = startRssSampler();
  const fileBytes = statSync(path).size;
  const metrics: Record<string, unknown> = {};
  try {
    const buf = readFileSync(path);
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const decoded = time(() => new TextDecoder().decode(bytes));
    metrics.decodeMs = decoded.ms;
    const parsed = time(() => JSON.parse(decoded.value) as unknown);
    metrics.parseMs = parsed.ms;
    metrics.isArray = Array.isArray(parsed.value);
  } catch (e) {
    return {
      role: "json.parse",
      fileBytes,
      peakRssBytes: stopSampler(),
      metrics,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
  }
  return {
    role: "json.parse",
    fileBytes,
    peakRssBytes: stopSampler(),
    metrics,
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

async function runRole(role: string, path: string): Promise<void> {
  let result: RoleResult;
  if (role === "indexer:structured") result = await runIndexerRole(path, false);
  else if (role === "indexer:wide") result = await runIndexerRole(path, true);
  else if (role === "json.parse") result = runJsonParseRole(path);
  else throw new Error(`Unknown role: ${role}`);
  process.stdout.write(" RESULT " + JSON.stringify(result) + "\n");
}

function spawnRole(
  role: string,
  path: string,
  maxOldSpaceMb: number,
): RoleResult {
  const self = fileURLToPath(import.meta.url);
  const proc = spawnSync(
    process.execPath,
    [
      `--max-old-space-size=${maxOldSpaceMb}`,
      self,
      `--role=${role}`,
      `--file=${path}`,
    ],
    { encoding: "utf8", maxBuffer: 64 * MB },
  );
  const out = proc.stdout ?? "";
  const marker = out.indexOf(" RESULT ");
  if (marker === -1) {
    return {
      role,
      fileBytes: existsSync(path) ? statSync(path).size : 0,
      peakRssBytes: 0,
      metrics: {},
      error:
        `child produced no result (exit ${proc.status}, signal ${proc.signal}). ` +
        `stderr: ${(proc.stderr ?? "").slice(-400)}`,
    };
  }
  const json = out.slice(marker + " RESULT ".length).split("\n")[0];
  return JSON.parse(json) as RoleResult;
}

function report(title: string, r: RoleResult): void {
  console.log(`\n=== ${title} ===`);
  if (r.error) {
    console.log(`  ERROR: ${r.error}`);
    console.log(`  peak RSS: ${fmtMB(r.peakRssBytes)} (before failure)`);
    return;
  }
  const ratio = r.fileBytes ? r.peakRssBytes / r.fileBytes : 0;
  console.log(`  file size : ${fmtMB(r.fileBytes)}`);
  console.log(
    `  peak RSS  : ${fmtMB(r.peakRssBytes)}  (${ratio.toFixed(2)}x file)`,
  );
  for (const [k, v] of Object.entries(r.metrics)) {
    if (k === "childrenPage_x3_ms" && Array.isArray(v)) {
      const [a, b, c] = v as number[];
      console.log(
        `  childrenPage(root,0,100) x3: [${fmtMs(a)}, ${fmtMs(b)}, ${fmtMs(
          c,
        )}]  -> page1/page3 = ${(a / Math.max(c, 1e-6)).toFixed(0)}x`,
      );
    } else if (typeof v === "number" && k.endsWith("Ms")) {
      console.log(`  ${k}: ${fmtMs(v)}`);
    } else {
      const s =
        typeof v === "string" && v.length > 60 ? `${v.slice(0, 60)}…` : v;
      console.log(`  ${k}: ${s}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function argOf(name: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : undefined;
}

async function main(): Promise<void> {
  const role = argOf("role");
  if (role) {
    await runRole(role, argOf("file")!);
    return;
  }

  // Orchestrator.
  if (!existsSync(SCRATCH)) mkdirSync(SCRATCH, { recursive: true });
  console.log("Generating payloads (idempotent) in", SCRATCH);
  const genStruct = time(() =>
    generateStructured(structuredPath, STRUCTURED_TARGET_BYTES),
  );
  const genWide = time(() => generateWide(widePath, WIDE_COUNT));
  console.log(
    `  structured: ${fmtMB(statSync(structuredPath).size)} (gen ${fmtMs(
      genStruct.ms,
    )})`,
  );
  console.log(
    `  wide      : ${fmtMB(statSync(widePath).size)}, ${WIDE_COUNT} elems (gen ${fmtMs(
      genWide.ms,
    )})`,
  );

  report(
    "OUR INDEXER — structured ~200MB",
    spawnRole("indexer:structured", structuredPath, 512),
  );
  report(
    "JSON.parse baseline — structured ~200MB",
    spawnRole("json.parse", structuredPath, 8192),
  );
  report(
    "OUR INDEXER — wide 2M array",
    spawnRole("indexer:wide", widePath, 256),
  );
  report(
    "JSON.parse baseline — wide 2M array",
    spawnRole("json.parse", widePath, 8192),
  );

  console.log(
    "\nNote: the indexer children run with a tight --max-old-space-size to " +
      "demonstrate it survives on a small JS heap (bytes live in an ArrayBuffer, " +
      "off the V8 heap); the JSON.parse baseline gets 8GB and still balloons.",
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
