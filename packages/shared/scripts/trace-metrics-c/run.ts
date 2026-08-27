import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  clickhouseClient,
  convertDateToClickhouseDateTime,
} from "../../src/server";
import {
  QueryMetrics,
  renderTraceMetricsReport,
  TraceMetricsBenchmark,
} from "./report";

type QueryRow = Record<string, unknown>;

type CliOptions = {
  projectId: string;
  tracePrefix: string;
  days: number;
  outputDir: string;
  skipGlobalSort: boolean;
};

const parseArgs = (args: string[]): CliOptions => {
  const get = (name: string, fallback?: string): string => {
    const index = args.indexOf(name);
    const value = index >= 0 ? args[index + 1] : fallback;
    if (!value) throw new Error(`Missing required argument ${name}`);
    return value;
  };

  const days = Number(get("--days", "90"));
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new Error("--days must be an integer between 1 and 366");
  }

  return {
    projectId: get("--project", "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a"),
    tracePrefix: `${get("--trace-prefix", "trace-metrics-shapes")}%`,
    days,
    outputDir: path.resolve(get("--output", "/opt/cursor/artifacts")),
    skipGlobalSort: args.includes("--skip-global-sort"),
  };
};

const sqlDir = path.resolve(
  __dirname,
  "../../clickhouse/scripts/trace-metrics-c",
);

const loadSql = async (name: string): Promise<string> =>
  readFile(path.join(sqlDir, name), "utf8");

const parseSummary = (
  header: string | string[] | undefined,
): { readRows: number; readBytes: number; resultRows: number } => {
  if (!header) return { readRows: 0, readBytes: 0, resultRows: 0 };
  try {
    const raw = JSON.parse(
      Array.isArray(header) ? header[0] : header,
    ) as Record<string, string | number>;
    return {
      readRows: Number(raw.read_rows ?? 0),
      readBytes: Number(raw.read_bytes ?? 0),
      resultRows: Number(raw.result_rows ?? 0),
    };
  } catch {
    return { readRows: 0, readBytes: 0, resultRows: 0 };
  }
};

const toNumber = (value: unknown): number =>
  value === null || value === undefined ? 0 : Number(value);

const compareTraces = (
  gold: QueryRow[],
  rollup: QueryRow[],
): TraceMetricsBenchmark["correctness"] => {
  const rollupById = new Map(rollup.map((row) => [String(row.trace_id), row]));
  const mismatches: string[] = [];
  const numericFields = ["cost", "tokens", "latency_ms", "span_count"] as const;

  for (const goldRow of gold) {
    const traceId = String(goldRow.trace_id);
    const rollupRow = rollupById.get(traceId);
    if (!rollupRow) {
      mismatches.push(`${traceId}: absent from rollup`);
      continue;
    }
    for (const field of numericFields) {
      if (
        Math.abs(toNumber(goldRow[field]) - toNumber(rollupRow[field])) > 1e-9
      ) {
        mismatches.push(
          `${traceId}.${field}: gold=${String(goldRow[field])} rollup=${String(rollupRow[field])}`,
        );
      }
    }
    rollupById.delete(traceId);
  }
  for (const traceId of rollupById.keys()) {
    mismatches.push(`${traceId}: absent from gold`);
  }

  return {
    comparedTraces: gold.length,
    mismatchCount: mismatches.length,
    mismatches,
  };
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  const client = clickhouseClient({
    request_timeout: 120_000,
    clickhouse_settings: {
      send_progress_in_http_headers: 1,
      http_headers_progress_interval_ms: "100",
    },
  });
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - options.days * 86_400_000);
  const baseParams = {
    projectId: options.projectId,
    tracePrefix: options.tracePrefix,
    from: convertDateToClickhouseDateTime(fromDate),
    to: convertDateToClickhouseDateTime(toDate),
    limit: 50,
  };
  const queries: QueryMetrics[] = [];

  const command = async (file: string): Promise<void> => {
    await client.command({
      query: await loadSql(file),
      query_params: baseParams,
    });
  };
  const runQuery = async (
    name: string,
    file: string,
    window: string,
    source: QueryMetrics["source"],
    params: Record<string, string | number> = baseParams,
  ): Promise<QueryRow[]> => {
    const startedAt = performance.now();
    const response = await client.query({
      query: await loadSql(file),
      query_params: params,
      format: "JSONEachRow",
    });
    const rows = await response.json<QueryRow>();
    const elapsedMs = performance.now() - startedAt;
    const summary = parseSummary(
      response.response_headers["x-clickhouse-summary"],
    );
    queries.push({
      name,
      window,
      source,
      elapsedMs,
      readRows: summary.readRows,
      readBytes: summary.readBytes,
      resultRows: summary.resultRows || rows.length,
      rows,
    });
    return rows;
  };

  await mkdir(options.outputDir, { recursive: true });
  await command("00-drop.sql");
  await command("01-create.sql");
  await command("02-populate.sql");

  const goldTraces = await runQuery(
    "gold-traces",
    "gold-traces.sql",
    "all",
    "gold",
  );
  const rollupTraces = await runQuery(
    "rollup-traces",
    "rollup-traces.sql",
    "all",
    "rollup",
  );
  const correctness = compareTraces(goldTraces, rollupTraces);

  const windows = [1, 7, options.days]
    .filter((days, index, all) => all.indexOf(days) === index)
    .map((days) => ({
      name: days === options.days ? "all" : `${days}d`,
      params: {
        ...baseParams,
        from: convertDateToClickhouseDateTime(
          new Date(toDate.getTime() - days * 86_400_000),
        ),
      },
    }));

  for (const window of windows) {
    await runQuery(
      "gold-top-n",
      "gold-top-n.sql",
      window.name,
      "gold",
      window.params,
    );
    await runQuery(
      "rollup-top-n",
      "rollup-top-n.sql",
      window.name,
      "rollup",
      window.params,
    );
    await runQuery(
      "gold-chart",
      "gold-chart.sql",
      window.name,
      "gold",
      window.params,
    );
    await runQuery(
      "rollup-chart",
      "rollup-chart.sql",
      window.name,
      "rollup",
      window.params,
    );
    await runQuery(
      "buckets-per-trace",
      "buckets-per-trace.sql",
      window.name,
      "diagnostic",
      window.params,
    );
    await runQuery(
      "events-top-k",
      "events-top-k.sql",
      window.name,
      "diagnostic",
      window.params,
    );
    if (!options.skipGlobalSort) {
      await runQuery(
        "events-global-sort",
        "events-global-sort.sql",
        window.name,
        "diagnostic",
        window.params,
      );
    }
  }

  const benchmark: TraceMetricsBenchmark = {
    generatedAt: new Date().toISOString(),
    projectId: options.projectId,
    tracePrefix: options.tracePrefix,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    correctness,
    queries,
  };
  const jsonPath = path.join(options.outputDir, "trace-metrics-c-results.json");
  const reportPath = path.join(
    options.outputDir,
    "trace-metrics-c-report.html",
  );
  await writeFile(jsonPath, JSON.stringify(benchmark, null, 2), "utf8");
  await renderTraceMetricsReport(benchmark, reportPath);

  process.stdout.write(
    `${JSON.stringify({
      correctness,
      queries: queries.length,
      jsonPath,
      reportPath,
    })}\n`,
  );
  if (correctness.mismatchCount > 0) process.exitCode = 1;
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
