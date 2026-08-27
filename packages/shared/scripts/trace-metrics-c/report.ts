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

export type FoldFactor = {
  rawEventRows: number;
  uniqueSpans: number;
  rollupRows: number;
  traces: number;
  versionsPerSpan: number;
  spansPerTrace: number;
  rawRowsPerTrace: number;
  rollupRowsPerTrace: number;
  rowFold: number;
};

export type DurationShape = {
  traces: number;
  unfinishedTraces: number;
  pctWithin5m: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  maxLatencyMs: number;
  pctSingleBucket: number;
  pctTwoBuckets: number;
  pctThreeToSixBuckets: number;
  pctOverSixBuckets: number;
};

export type DashboardCheck = {
  compared: number;
  mismatchCount: number;
  mismatches: string[];
};

export type DashboardCorrectness = {
  costByDay: DashboardCheck;
  costByUser: DashboardCheck;
  avgTraceCostByDay: DashboardCheck;
  bVersusCDay: DashboardCheck;
  avgTraceVersusAvgSpan: DashboardCheck;
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
  foldFactor: FoldFactor;
  durationShape: DurationShape;
  dashboardCorrectness: DashboardCorrectness;
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
      "join-filter-expensive-traces",
      "dash-pushdown-cost-by-day",
      "dash-rollup-b-cost-by-day",
      "dash-pushdown-avg-trace-cost-by-day",
      "dash-rollup-c-avg-trace-cost-by-day",
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

const ratio = (goldValue: number, rollupValue: number): string =>
  rollupValue > 0 ? `${(goldValue / rollupValue).toFixed(1)}x` : "n/a";

/**
 * The headline the p95-buckets card alone does not give: how much less data the
 * rollup touches for the same answer, per query pair.
 */
const scanReductionTable = (queries: QueryMetrics[]): string => {
  const pairs = [
    ["gold-traces", "rollup-traces", "Full trace list (collapse all)"],
    ["gold-top-n", "rollup-top-n", "Top-N traces by cost"],
    ["gold-chart", "rollup-chart", "Daily average chart"],
    ["events-global-sort", "events-top-k", "Events sorted by trace cost"],
    [
      "dash-pushdown-cost-by-day",
      "dash-rollup-b-cost-by-day",
      "Dashboard: cost incurred by day (B)",
    ],
    [
      "dash-pushdown-cost-by-user",
      "dash-rollup-b-cost-by-user",
      "Dashboard: cost by user (B)",
    ],
    [
      "dash-pushdown-avg-trace-cost-by-day",
      "dash-rollup-c-avg-trace-cost-by-day",
      "Dashboard: avg trace total by day (C)",
    ],
  ] as const;

  const rows = pairs.flatMap(([goldName, rollupName, label]) =>
    queries
      .filter((query) => query.name === goldName)
      .map((gold) => {
        const rollup = queries.find(
          (query) => query.name === rollupName && query.window === gold.window,
        );
        if (!rollup) return "";
        return `<tr>
          <td>${escapeHtml(gold.window)}</td>
          <td>${escapeHtml(label)}</td>
          <td>${gold.readRows.toLocaleString()} → ${rollup.readRows.toLocaleString()}</td>
          <td class="good">${ratio(gold.readRows, rollup.readRows)}</td>
          <td>${humanBytes(gold.readBytes)} → ${humanBytes(rollup.readBytes)}</td>
          <td class="good">${ratio(gold.readBytes, rollup.readBytes)}</td>
          <td>${gold.elapsedMs.toFixed(1)} → ${rollup.elapsedMs.toFixed(1)} ms</td>
        </tr>`;
      }),
  );

  return `<table>
    <thead><tr><th>Window</th><th>Query</th><th>Read rows gold → rollup</th><th>Rows saved</th><th>Read bytes gold → rollup</th><th>Bytes saved</th><th>Elapsed</th></tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
};

const foldFactorSection = (fold: FoldFactor): string => `
  <table>
    <thead><tr><th>Stage</th><th>Rows</th><th>Per trace</th><th>What it costs</th></tr></thead>
    <tbody>
      <tr><td>Raw <code>events_core</code> versions</td><td>${fold.rawEventRows.toLocaleString()}</td><td>${fold.rawRowsPerTrace.toFixed(2)}</td><td>Scanned by the gold query before any dedup</td></tr>
      <tr><td>Deduplicated spans</td><td>${fold.uniqueSpans.toLocaleString()}</td><td>${fold.spansPerTrace.toFixed(2)}</td><td>What <code>LIMIT 1 BY</code> leaves behind</td></tr>
      <tr><td>Five-minute rollup rows</td><td>${fold.rollupRows.toLocaleString()}</td><td>${fold.rollupRowsPerTrace.toFixed(2)}</td><td>Scanned by the rollup query</td></tr>
    </tbody>
  </table>
  <p class="muted">Row fold is <strong class="good">${fold.rowFold.toFixed(1)}x</strong>
  (${fold.rawEventRows.toLocaleString()} raw versions → ${fold.rollupRows.toLocaleString()} rollup rows).
  It is driven by spans per trace (${fold.spansPerTrace.toFixed(2)}) and versions per span
  (${fold.versionsPerSpan.toFixed(3)}), <em>not</em> by trace duration. Duration only decides how
  many five-minute keys one trace occupies.</p>`;

const joinRow = (
  queries: QueryMetrics[],
  name: string,
  window: string,
): Record<string, unknown> | undefined =>
  queries.find((query) => query.name === name && query.window === window)
    ?.rows[0];

const joinPatternsSection = (queries: QueryMetrics[]): string => {
  const windows = [...new Set(queries.map((query) => query.window))];
  const rows = windows.flatMap((window) => {
    const collapsed = joinRow(queries, "join-collapsed-vs-gold", window);
    const raw = joinRow(queries, "join-raw-c", window);
    const bucket = joinRow(queries, "join-on-bucket", window);
    const sameWindow = joinRow(queries, "join-same-window-undercount", window);
    const tracesFirst = queries.find(
      (query) =>
        query.name === "join-filter-expensive-traces" &&
        query.window === window,
    );
    const eventsFirst = queries.find(
      (query) => query.name === "events-global-sort" && query.window === window,
    );
    const topK = queries.find(
      (query) => query.name === "events-top-k" && query.window === window,
    );
    if (!collapsed || !raw || !bucket || !sameWindow) return [];

    const collapsedOk = toNumber(collapsed.cost_mismatches) === 0;
    const rawDupes = toNumber(raw.duplicate_event_rows);
    const bucketWrong = toNumber(bucket.fragment_ne_trace_cost);
    const undercounted = toNumber(sameWindow.traces_undercounted_same_window);

    return [
      `<tr>
      <td>${escapeHtml(window)}</td>
      <td class="${collapsedOk ? "pass" : "fail"}">${collapsedOk ? "PASS" : "FAIL"} · ${Number(collapsed.event_rows).toLocaleString()} events, ${Number(collapsed.cost_mismatches).toLocaleString()} cost mismatches</td>
      <td class="${rawDupes > 0 ? "fail" : "pass"}">${Number(raw.joined_rows).toLocaleString()} joined rows, ${rawDupes.toLocaleString()} duplicates</td>
      <td class="${bucketWrong > 0 ? "fail" : "pass"}">${bucketWrong.toLocaleString()} events with fragment ≠ trace cost (${escapeHtml(bucket.pct_wrong_cost)}%)</td>
      <td class="${undercounted > 0 ? "fail" : "pass"}">${undercounted.toLocaleString()} traces (${escapeHtml(sameWindow.pct_undercounted)}%)</td>
      <td>${topK ? `${topK.elapsedMs.toFixed(1)} ms` : "—"} / ${eventsFirst ? `${eventsFirst.elapsedMs.toFixed(1)} ms` : "—"} / ${tracesFirst ? `${tracesFirst.elapsedMs.toFixed(1)} ms` : "—"}</td>
    </tr>`,
    ];
  });

  return `<p class="muted">Collapsed join must match gold. Raw C join, bucket join, and same-window C are expected to be <em>wrong or duplicated</em> whenever traces occupy more than one bucket. Last column is elapsed for traces-first Top-K / events-first global sort / filter-expensive-then-events.</p>
  <table>
    <thead><tr>
      <th>Window</th>
      <th>Join collapsed C</th>
      <th>Join raw C</th>
      <th>Join on 5m bucket</th>
      <th>Same-window C undercount</th>
      <th>Top-K / global sort / filter-then-events</th>
    </tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
};

const toNumber = (value: unknown): number =>
  value === null || value === undefined ? 0 : Number(value);

const durationSection = (shape: DurationShape): string => {
  const bars = [
    ["1 bucket", shape.pctSingleBucket, "#22c55e"],
    ["2 buckets", shape.pctTwoBuckets, "#84cc16"],
    ["3–6 buckets", shape.pctThreeToSixBuckets, "#eab308"],
    ["7+ buckets", shape.pctOverSixBuckets, "#ef4444"],
  ] as const;

  return `
  <p class="muted"><strong>${shape.pctWithin5m.toFixed(1)}%</strong> of traces complete within five
  minutes, and <strong>${shape.pctSingleBucket.toFixed(1)}%</strong> occupy a single bucket.
  A high single-bucket share is the grain succeeding — one row answers the trace — and is also the
  reason a coarser trace-keyed grain (1h, 1d) cannot shrink this table further.</p>
  <svg viewBox="0 0 900 ${20 + bars.length * 40}" role="img" aria-label="Buckets per trace distribution">
    ${bars
      .map(([label, pct, color], index) => {
        const y = 10 + index * 40;
        const width = Math.max(1, (pct / 100) * 560);
        return `<text x="0" y="${y + 20}" class="label">${escapeHtml(label)}</text>
          <rect x="150" y="${y + 4}" width="${width}" height="22" rx="4" fill="${color}" />
          <text x="${160 + width}" y="${y + 20}" class="value">${pct.toFixed(2)}%</text>`;
      })
      .join("")}
  </svg>
  <table>
    <thead><tr><th>Traces</th><th>Unfinished</th><th>p50 latency</th><th>p95 latency</th><th>p99 latency</th><th>max latency</th></tr></thead>
    <tbody><tr>
      <td>${shape.traces.toLocaleString()}</td>
      <td>${shape.unfinishedTraces.toLocaleString()}</td>
      <td>${(shape.p50LatencyMs / 1000).toFixed(2)} s</td>
      <td>${(shape.p95LatencyMs / 1000).toFixed(2)} s</td>
      <td>${(shape.p99LatencyMs / 1000).toFixed(2)} s</td>
      <td>${(shape.maxLatencyMs / 1000).toFixed(2)} s</td>
    </tr></tbody>
  </table>`;
};

/**
 * Guards against over-reading a small local run. Each caveat is derived from
 * the measured cohort, so it disappears when the data no longer warrants it.
 */
const caveats = (benchmark: TraceMetricsBenchmark): string[] => {
  const { foldFactor: fold, durationShape: shape } = benchmark;
  const notes: string[] = [];

  if (fold.versionsPerSpan < 1.05) {
    notes.push(
      `Versions per span is ${fold.versionsPerSpan.toFixed(3)}, so this seed has almost no ReplacingMergeTree updates. The gold query's <code>LIMIT 1 BY</code> dedup is nearly free here and its production cost is <strong>understated</strong> by this run.`,
    );
  }
  if (fold.spansPerTrace < 10) {
    notes.push(
      `Traces average ${fold.spansPerTrace.toFixed(2)} spans. Row fold scales with spans per trace, so deep agent traces (50–5000 spans) would fold far more than the ${fold.rowFold.toFixed(1)}x measured here.`,
    );
  }
  if (fold.traces < 1_000_000) {
    notes.push(
      `The cohort is ${fold.traces.toLocaleString()} traces. At this size ClickHouse answers from memory, so wall-clock differences stay small even when bytes read drop sharply. Treat elapsed times as query shape, not capacity planning.`,
    );
  }
  if (shape.pctSingleBucket > 90) {
    notes.push(
      `${shape.pctSingleBucket.toFixed(1)}% of traces sit in one bucket, so an additional hourly or daily <em>trace-keyed</em> rollup would copy roughly the same row count. That is an argument against a deeper ladder, not against the five-minute grain.`,
    );
  }
  notes.push(
    `Only complete five-minute buckets are measured. Production must UNION raw <code>events_core</code> edges for the in-flight bucket, or traces from the last few minutes vanish from the list.`,
  );
  notes.push(
    `Dashboard windows use complete calendar days only (partial days would UNION <code>events_core</code>). A 1-day clock window often has zero complete days and is skipped.`,
  );

  return notes;
};

const dashboardCheckRow = (label: string, check: DashboardCheck): string => {
  const ok = check.mismatchCount === 0;
  return `<tr>
    <td>${escapeHtml(label)}</td>
    <td>${check.compared.toLocaleString()}</td>
    <td class="${ok ? "pass" : "fail"}">${ok ? "PASS" : "FAIL"} · ${check.mismatchCount.toLocaleString()} mismatches</td>
    <td>${check.mismatches.length > 0 ? `<pre>${escapeHtml(check.mismatches.join("\n"))}</pre>` : "—"}</td>
  </tr>`;
};

const dashboardSection = (dashboard: DashboardCorrectness): string => `
  <p>Job B is a daily observation rollup <em>without</em> <code>trace_id</code> in the key
  (cost incurred by span start day / user). Job C is the five-minute trace-keyed table
  (true per-trace totals attributed to <code>min(start_time)</code>). They answer different
  dashboard questions and are allowed to disagree.</p>
  <table>
    <thead><tr><th>Check</th><th>Compared keys</th><th>Result</th><th>Sample diffs</th></tr></thead>
    <tbody>
      ${dashboardCheckRow("Push-down vs B: cost by day (must match)", dashboard.costByDay)}
      ${dashboardCheckRow("Push-down vs B: cost by user (must match)", dashboard.costByUser)}
      ${dashboardCheckRow("Push-down vs C: avg trace cost by day (must match)", dashboard.avgTraceCostByDay)}
      ${dashboardCheckRow("B vs C: cost by day (expected diffs when traces cross midnight)", dashboard.bVersusCDay)}
      ${dashboardCheckRow("Avg trace total vs avg span cost (wrong chart; expected diffs)", dashboard.avgTraceVersusAvgSpan)}
    </tbody>
  </table>`;

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
    benchmark.correctness.mismatchCount === 0 &&
    benchmark.dashboardCorrectness.costByDay.mismatchCount === 0 &&
    benchmark.dashboardCorrectness.costByUser.mismatchCount === 0 &&
    benchmark.dashboardCorrectness.avgTraceCostByDay.mismatchCount === 0
      ? "pass"
      : "fail";

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
    .pass { color: #4ade80; } .fail { color: #f87171; } .good { color: #4ade80; }
    ul { line-height: 1.65; padding-left: 20px; } li { margin-bottom: 8px; }
    strong { color: #f1f5f9; }
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
    <div class="card"><div class="muted">Compared traces</div><div class="big">${benchmark.correctness.comparedTraces.toLocaleString()}</div></div>
    <div class="card"><div class="muted">Row fold raw → rollup</div><div class="big good">${benchmark.foldFactor.rowFold.toFixed(1)}x</div></div>
    <div class="card"><div class="muted">Traces in one bucket</div><div class="big">${benchmark.durationShape.pctSingleBucket.toFixed(1)}%</div></div>
  </div>
  <section><h2>Read this first</h2>
    <p>The rollup answers the same trace metrics while reading
    <strong class="good">${benchmark.foldFactor.rowFold.toFixed(1)}x</strong> fewer rows.
    <strong>${benchmark.durationShape.pctSingleBucket.toFixed(1)}%</strong> of traces occupy a single
    five-minute bucket (p95 buckets/trace ${escapeHtml(buckets?.p95 ?? "—")},
    max ${escapeHtml(buckets?.max ?? "—")}).</p>
    <p class="muted">A near-1 buckets-per-trace figure is the grain working, not a missing win: one
    rollup row answers one trace. It only argues against stacking a coarser <em>trace-keyed</em>
    rollup (1h, 1d) on top. See "What this run cannot tell you" before generalising.</p>
  </section>
  <section><h2>Scan reduction, gold vs rollup</h2><p class="muted">Same answer, same cohort. Lower is better for gold → rollup.</p>${scanReductionTable(benchmark.queries)}</section>
  <section><h2>Events ⊕ traces AMT join patterns</h2>${joinPatternsSection(benchmark.queries)}</section>
  <section><h2>Dashboard roll-up vs push-down</h2>${dashboardSection(benchmark.dashboardCorrectness)}</section>
  <section><h2>Where the rows go</h2>${foldFactorSection(benchmark.foldFactor)}</section>
  <section><h2>Do traces fit in five minutes?</h2>${durationSection(benchmark.durationShape)}</section>
  <section><h2>What this run cannot tell you</h2><ul>${caveats(benchmark)
    .map((note) => `<li>${note}</li>`)
    .join("")}</ul></section>
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
