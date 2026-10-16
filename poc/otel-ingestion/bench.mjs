// Multi-run engine comparison: alternates engine runs (plus one discarded
// warmup round) so thermal and background drift spread across all engines,
// then reports median [min..max] per metric.
//
// Usage: node bench.mjs [runs=6] [concurrency=4] [engines=ch,rust]
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const RUNS = Number(process.argv[2] ?? 6);
const CONC = String(process.argv[3] ?? 4);
const ENGINES = (process.argv[4] ?? "ch,rust").split(",");

const CH = {
  url: process.env.POC_CH_URL ?? "http://127.0.0.1:8123",
  user: process.env.POC_CH_USER ?? "clickhouse",
  password: process.env.POC_CH_PASSWORD ?? "clickhouse",
};

async function chq(sql) {
  const res = await fetch(`${CH.url}/?database=poc_chlb`, {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${CH.user}:${CH.password}`).toString("base64"),
    },
    body: sql,
  });
  if (!res.ok) throw new Error(`CH ${res.status}: ${await res.text()}`);
}

function num(stdout, re, name) {
  const m = stdout.match(re);
  if (!m) throw new Error(`could not parse ${name} from harness output`);
  return Number(m[1]);
}

// formatReadableSize picks the unit: pathological windows push peaks past MiB
function parsePeakMib(stdout) {
  const m = stdout.match(/peak_mem_per_query: '([\d.]+) ([KMGT]iB|B)'/);
  if (!m) throw new Error("could not parse peak from harness output");
  const toMib = {
    B: 1 / 1048576,
    KiB: 1 / 1024,
    MiB: 1,
    GiB: 1024,
    TiB: 1048576,
  };
  return Number(m[1]) * toMib[m[2]];
}

async function runOnce(engine) {
  await chq("TRUNCATE TABLE poc_chlb.events_poc");
  const { stdout } = await execFileP(
    "node",
    ["harness.mjs", "--engine", engine, "--concurrency", CONC],
    {
      cwd: new URL(".", import.meta.url).pathname,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const staged = num(stdout, /(\d+) rows staged/, "rows staged");
  const target = num(stdout, /(\d+) rows in target/, "rows in target");
  if (staged !== target) throw new Error(`row loss: ${staged} vs ${target}`);
  const queries = num(stdout, /queries: (\d+)/, "query count");
  const r = {
    rows: staged,
    queries,
    wall_s: num(stdout, /wall: ([\d.]+)s ->/, "wall"),
    mbps: num(stdout, /-> ([\d.]+) MB\/s/, "MB/s"),
    server_cpu_s: num(stdout, /cpu_s: ([\d.]+)/, "server cpu"),
    server_peak_mib: parsePeakMib(stdout),
    insert_ms: [...stdout.matchAll(/insert=(\d+)ms/g)].map((m) => Number(m[1])),
  };
  if (stdout.includes("worker:")) {
    r.worker_cpu_s = num(stdout, /worker: cpu=([\d.]+)s/, "worker cpu");
    r.worker_rss_mib = num(stdout, /max_rss=(\d+)MiB/, "worker rss");
  }
  r.total_cpu_s = r.server_cpu_s + (r.worker_cpu_s ?? 0);
  return r;
}

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const fmt = (xs, digits = 2) =>
  `${med(xs).toFixed(digits)} [${Math.min(...xs).toFixed(digits)}..${Math.max(...xs).toFixed(digits)}]`;

const results = Object.fromEntries(ENGINES.map((e) => [e, []]));
for (let i = 0; i <= RUNS; i++) {
  for (const engine of ENGINES) {
    const r = await runOnce(engine);
    const warmup = i === 0;
    if (!warmup) results[engine].push(r);
    console.log(
      `${warmup ? "warmup" : `run ${i}`} ${engine.padEnd(4)} ` +
        `wall=${r.wall_s}s ${r.mbps}MB/s total_cpu=${r.total_cpu_s.toFixed(2)}s ` +
        `server_peak=${r.server_peak_mib}MiB rows=${r.rows} queries=${r.queries}` +
        (r.queries !== r.insert_ms.length
          ? "  (query_log count mismatch!)"
          : ""),
    );
  }
}

console.log(
  `\n=== median [min..max] over ${RUNS} alternating runs @${CONC} ===`,
);
const col = (f, digits) =>
  ENGINES.map((e) => `${e}: ${fmt(results[e].map(f), digits)}`).join("   ");
console.log(`wall_s          ${col((r) => r.wall_s)}`);
console.log(`MB/s            ${col((r) => r.mbps, 1)}`);
console.log(`total_cpu_s     ${col((r) => r.total_cpu_s)}`);
console.log(`server_cpu_s    ${col((r) => r.server_cpu_s)}`);
console.log(`server_peak_mib ${col((r) => r.server_peak_mib, 0)}`);
for (const e of ENGINES) {
  if (results[e][0]?.worker_cpu_s === undefined) continue;
  console.log(
    `worker ${e.padEnd(4)}     cpu_s ${fmt(results[e].map((r) => r.worker_cpu_s))}, ` +
      `rss_mib ${fmt(
        results[e].map((r) => r.worker_rss_mib),
        0,
      )}`,
  );
}
console.log(
  `per-batch insert_ms (all windows pooled)   ` +
    ENGINES.map(
      (e) =>
        `${e}: ${fmt(
          results[e].flatMap((r) => r.insert_ms),
          0,
        )}`,
    ).join("   "),
);
