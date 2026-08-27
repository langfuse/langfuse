import { writeFile } from "node:fs/promises";

export type QueryMetrics = {
  name: string;
  window: string;
  source: "gold" | "rollup" | "diagnostic";
  elapsedMs: number;
  readRows: number;
  readBytes: number;
  resultRows: number;
  rows: Record<string, unknown>[];
};

export type TraceMetricsBenchmark = {
  generatedAt: string;
  projectId: string;
  tracePrefix: string;
  from: string;
  to: string;
  correctness: {
    comparedTraces: number;
    mismatchCount: number;
    mismatches: string[];
  };
  queries: QueryMetrics[];
};

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const escapeHtml = (value: unknown): string =>
  Array.from(String(value), (ch) => HTML_ESCAPE[ch] ?? ch).join("");

const humanBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
};

const queryBarChart = (queries: QueryMetrics[]): string => {
  const comparable = queries.filter((query) =>
    [
      "gold-top-n",
      "rollup-top-n",
      "events-top-k",
      "events-global-sort",
    ].includes(query.name),
  );
  const max = Math.max(...comparable.map((query) => query.elapsedMs), 1);
  const width = 900;
  const barHeight = 28;
  const height = 40 + comparable.length * 52;

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Query elapsed time">
    ${comparable
      .map((query, index) => {
        const y = 28 + index * 52;
        const barWidth = Math.max(2, (query.elapsedMs / max) * 620);
        const color =
          query.source === "gold"
            ? "#ef4444"
            : query.source === "rollup"
              ? "#22c55e"
              : "#3b82f6";
        return `<text x="0" y="${y + 18}" class="label">${escapeHtml(`${query.window} ${query.name}`)}</text>
          <rect x="235" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${color}" />
          <text x="${245 + barWidth}" y="${y + 19}" class="value">${query.elapsedMs.toFixed(1)} ms · ${humanBytes(query.readBytes)}</text>`;
      })
      .join("")}
  </svg>`;
};

const traceCostChart = (queries: QueryMetrics[]): string => {
  const gold = queries.find(
    (query) => query.name === "gold-top-n" && query.window === "all",
  );
  const rollup = queries.find(
    (query) => query.name === "rollup-top-n" && query.window === "all",
  );
  if (!gold || !rollup) return "<p>No all-window Top-N result.</p>";

  const rollupByTrace = new Map(
    rollup.rows.map((row) => [String(row.trace_id), Number(row.cost)]),
  );
  const rows = gold.rows.slice(0, 12).map((row) => ({
    traceId: String(row.trace_id),
    gold: Number(row.cost),
    rollup: rollupByTrace.get(String(row.trace_id)) ?? 0,
  }));
  const max = Math.max(...rows.flatMap((row) => [row.gold, row.rollup]), 1);

  return `<svg viewBox="0 0 900 ${45 + rows.length * 42}" role="img" aria-label="Gold and rollup trace costs">
    ${rows
      .map((row, index) => {
        const y = 25 + index * 42;
        const goldWidth = (row.gold / max) * 500;
        const rollupWidth = (row.rollup / max) * 500;
        return `<text x="0" y="${y + 14}" class="label">${escapeHtml(row.traceId.replace(/^.*?-/, ""))}</text>
          <rect x="230" y="${y}" width="${goldWidth}" height="12" rx="2" fill="#ef4444" opacity="0.65" />
          <rect x="230" y="${y + 15}" width="${rollupWidth}" height="12" rx="2" fill="#22c55e" opacity="0.8" />
          <text x="740" y="${y + 18}" class="value">${row.gold.toFixed(4)} / ${row.rollup.toFixed(4)}</text>`;
      })
      .join("")}
  </svg>`;
};

const dailyAverageChart = (queries: QueryMetrics[]): string => {
  const gold = queries.find(
    (query) => query.name === "gold-chart" && query.window === "all",
  );
  const rollup = queries.find(
    (query) => query.name === "rollup-chart" && query.window === "all",
  );
  if (!gold || !rollup || gold.rows.length === 0) {
    return "<p>No all-window chart result.</p>";
  }

  const rollupByDay = new Map(
    rollup.rows.map((row) => [String(row.day), Number(row.avg_cost)]),
  );
  const points = gold.rows.map((row) => ({
    day: String(row.day),
    gold: Number(row.avg_cost),
    rollup: rollupByDay.get(String(row.day)) ?? 0,
  }));
  const max = Math.max(
    ...points.flatMap((point) => [point.gold, point.rollup]),
    1,
  );
  const width = 900;
  const height = 300;
  const x = (index: number) =>
    60 + (index / Math.max(points.length - 1, 1)) * (width - 100);
  const y = (value: number) => height - 45 - (value / max) * (height - 85);
  const pathFor = (field: "gold" | "rollup") =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point[field]).toFixed(1)}`,
      )
      .join(" ");

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily average trace cost">
    <line x1="60" y1="${height - 45}" x2="${width - 30}" y2="${height - 45}" stroke="#475569" />
    <line x1="60" y1="30" x2="60" y2="${height - 45}" stroke="#475569" />
    <path d="${pathFor("gold")}" fill="none" stroke="#ef4444" stroke-width="3" />
    <path d="${pathFor("rollup")}" fill="none" stroke="#22c55e" stroke-width="2" stroke-dasharray="7 5" />
    ${points
      .filter(
        (_, index) =>
          index === 0 ||
          index === points.length - 1 ||
          index % Math.max(1, Math.floor(points.length / 6)) === 0,
      )
      .map(
        (point) =>
          `<text x="${x(points.indexOf(point))}" y="${height - 20}" text-anchor="middle">${escapeHtml(point.day.slice(5))}</text>`,
      )
      .join("")}
    <text x="70" y="22">max ${max.toFixed(4)} USD</text>
    <text x="${width - 230}" y="22" fill="#ef4444">gold</text>
    <text x="${width - 170}" y="22" fill="#22c55e">rollup</text>
  </svg>`;
};

const queryTable = (queries: QueryMetrics[]): string =>
  `<table>
    <thead><tr><th>Window</th><th>Query</th><th>Source</th><th>Elapsed</th><th>Read rows</th><th>Read bytes</th><th>Result rows</th></tr></thead>
    <tbody>${queries
      .map(
        (query) =>
          `<tr><td>${escapeHtml(query.window)}</td><td>${escapeHtml(query.name)}</td><td>${escapeHtml(query.source)}</td><td>${query.elapsedMs.toFixed(1)} ms</td><td>${query.readRows.toLocaleString()}</td><td>${humanBytes(query.readBytes)}</td><td>${query.resultRows.toLocaleString()}</td></tr>`,
      )
      .join("")}</tbody>
  </table>`;

export const renderTraceMetricsReport = async (
  benchmark: TraceMetricsBenchmark,
  outputPath: string,
): Promise<void> => {
  const buckets = benchmark.queries.find(
    (query) => query.name === "buckets-per-trace" && query.window === "all",
  )?.rows[0];
  const correctnessClass =
    benchmark.correctness.mismatchCount === 0 ? "pass" : "fail";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Trace metrics C benchmark</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #0b1020; color: #e5e7eb; }
    main { max-width: 1100px; margin: 0 auto; padding: 40px 28px 80px; }
    h1 { margin-bottom: 8px; } h2 { margin-top: 36px; }
    .muted { color: #94a3b8; } .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .card, section { background: #111827; border: 1px solid #253047; border-radius: 12px; padding: 18px; }
    section { margin-top: 18px; overflow-x: auto; }
    .big { font-size: 28px; font-weight: 700; margin-top: 6px; }
    .pass { color: #4ade80; } .fail { color: #f87171; }
    svg { width: 100%; min-width: 760px; } svg text { fill: #cbd5e1; font-size: 12px; }
    svg .label { text-anchor: start; } svg .value { font-variant-numeric: tabular-nums; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; border-bottom: 1px solid #253047; padding: 10px 8px; }
    th { color: #94a3b8; }
    code { background: #1e293b; border-radius: 4px; padding: 2px 5px; }
  </style>
</head>
<body><main>
  <h1>Trace metrics C benchmark</h1>
  <p class="muted">Generated ${escapeHtml(benchmark.generatedAt)} · prefix <code>${escapeHtml(benchmark.tracePrefix)}</code></p>
  <div class="cards">
    <div class="card"><div class="muted">Correctness</div><div class="big ${correctnessClass}">${benchmark.correctness.mismatchCount === 0 ? "PASS" : "FAIL"}</div></div>
    <div class="card"><div class="muted">Compared traces</div><div class="big">${benchmark.correctness.comparedTraces}</div></div>
    <div class="card"><div class="muted">p95 buckets / trace</div><div class="big">${escapeHtml(buckets?.p95 ?? "—")}</div></div>
    <div class="card"><div class="muted">Max buckets / trace</div><div class="big">${escapeHtml(buckets?.max ?? "—")}</div></div>
  </div>
  <section><h2>Gold vs five-minute rollup costs</h2><p class="muted">Red is the deduplicated <code>events_core</code> gold query. Green is the trace rollup.</p>${traceCostChart(benchmark.queries)}</section>
  <section><h2>Daily average trace cost</h2><p class="muted">The dashed rollup series must overlap the deduplicated raw-event gold series.</p>${dailyAverageChart(benchmark.queries)}</section>
  <section><h2>Query elapsed time and bytes read</h2>${queryBarChart(benchmark.queries)}</section>
  <section><h2>All query measurements</h2>${queryTable(benchmark.queries)}</section>
  ${
    benchmark.correctness.mismatches.length > 0
      ? `<section><h2>Correctness mismatches</h2><pre>${escapeHtml(benchmark.correctness.mismatches.join("\n"))}</pre></section>`
      : ""
  }
</main></body></html>`;

  await writeFile(outputPath, html, "utf8");
};
