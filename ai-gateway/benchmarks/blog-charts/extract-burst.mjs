// Builds burst-timeline.json from one burst run per runtime:
//   node extract-burst.mjs <results-dir> <case> <events.jsonl> rust=<dir> node=<dir> python=<dir>
// Each <dir> holds <case>.json (loadgen summary) and <case>.cgroup.csv.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [resultsDir, caseName, eventsFile, ...runs] = process.argv.slice(2);
const MIB = 1024 * 1024;

const events = readFileSync(eventsFile, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((event) => event.status === "oom" || event.Action === "oom")
  .map((event) => Number(event.timeNano) / 1e9);

const out = { case: caseName, runtimes: {} };
for (const run of runs) {
  const [key, dir] = run.split("=");
  const summary = JSON.parse(
    readFileSync(join(resultsDir, dir, `${caseName}.json`), "utf8"),
  );
  const start = summary.started_unix;
  const end = start + summary.measured_seconds;

  const memory = new Map();
  const rows = readFileSync(
    join(resultsDir, dir, `${caseName}.cgroup.csv`),
    "utf8",
  )
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(","));
  for (const [t, service, current] of rows) {
    if (service !== "ai-gateway") continue;
    const offset = Math.floor(Number(t) - start);
    if (offset < -1 || Number(t) > end + 2) continue;
    memory.set(offset, Math.max(memory.get(offset) ?? 0, Number(current) / MIB));
  }

  const errors = Object.values(summary.errors).reduce((a, b) => a + b, 0);
  out.runtimes[key] = {
    requests: summary.requests,
    ok: summary.ok,
    errors: summary.errors,
    failed: errors,
    seconds: summary.measured_seconds,
    // Seconds (since start) in which requests failed other than with a 503.
    failureSeconds: summary.timeline
      .filter((second) => second.failed > 0)
      .map((second) => second.t - Math.floor(start)),
    memory: [...memory]
      .sort((a, b) => a[0] - b[0])
      .map(([t, mib]) => ({ t, mib: Math.round(mib) })),
    oomKills: events
      .filter((at) => at >= start - 1 && at <= end + 2)
      .map((at) => Math.round((at - start) * 10) / 10),
  };
}

writeFileSync(
  new URL("./burst-timeline.json", import.meta.url),
  JSON.stringify(out, null, 2) + "\n",
);
console.log(
  Object.entries(out.runtimes)
    .map(
      ([key, r]) =>
        `${key}: ok ${r.ok}/${r.requests}, peak ${Math.max(...r.memory.map((m) => m.mib))} MiB, ${r.seconds.toFixed(1)} s, oom at [${r.oomKills}]`,
    )
    .join("\n"),
);
