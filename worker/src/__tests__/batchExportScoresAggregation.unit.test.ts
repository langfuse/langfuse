import { afterEach, describe, expect, it, vi } from "vitest";

// @langfuse/shared parses env at import time. These values let the unit
// test import the stream query builders without a local .env / ClickHouse.
vi.hoisted(() => {
  process.env.DATABASE_URL ??=
    "postgresql://postgres:postgres@localhost:5432/postgres";
  process.env.CLICKHOUSE_URL ??= "http://localhost:8123";
  process.env.CLICKHOUSE_USER ??= "clickhouse";
  process.env.CLICKHOUSE_PASSWORD ??= "clickhouse";
  process.env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET ??= "langfuse";
});

const mocks = vi.hoisted(() => ({
  getDistinctScoreNames: vi.fn().mockResolvedValue([]),
  queryClickhouseStream: vi.fn(),
  shouldSkipScoresDedup: vi.fn().mockReturnValue(false),
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
}));

vi.mock("../env", () => ({
  env: {
    BATCH_EXPORT_ROW_LIMIT: 1_500_000,
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    getDistinctScoreNames: mocks.getDistinctScoreNames,
    queryClickhouseStream: mocks.queryClickhouseStream,
    shouldSkipScoresDedup: mocks.shouldSkipScoresDedup,
    shouldSkipObservationsFinal: mocks.shouldSkipObservationsFinal,
  };
});

vi.mock("../features/database-read-stream/fetchCommentsForExport", () => ({
  fetchCommentsForExport: vi.fn(),
}));

import { getObservationStream } from "../features/database-read-stream/observation-stream";
import { getTraceStream } from "../features/database-read-stream/trace-stream";

async function* emptyRows() {
  // No ClickHouse rows needed; we only assert the generated SQL.
}

const streamProps = {
  projectId: "project-1",
  cutoffCreatedAt: new Date("2026-07-09T15:08:01.953Z"),
  filter: [] as const,
};

/**
 * Extract the inner `FROM scores` aggregation that computes avg(value)
 * before the outer scores_agg GROUP BY. Newer ClickHouse analyzers reject
 * GROUP BY columns that are not in this subquery's SELECT list (#13982).
 */
function parseInnerScoresAggregation(sql: string): {
  selectColumns: string[];
  groupByColumns: string[];
  subquery: string;
} {
  const match = sql.match(
    /FROM\s*\(\s*(SELECT\s+[\s\S]*?FROM\s+scores[\s\S]*?GROUP BY\s+([\s\S]*?))(?:ORDER BY[\s\S]*?)?\)\s*tmp/i,
  );
  if (!match) {
    throw new Error(
      `Could not find inner scores aggregation subquery in SQL:\n${sql}`,
    );
  }

  const subquery = match[1];
  const groupByRaw = match[2].trim();
  const selectMatch = subquery.match(/^SELECT\s+([\s\S]*?)\s+FROM\s+scores/i);
  if (!selectMatch) {
    throw new Error(
      `Could not parse SELECT list of inner scores subquery:\n${subquery}`,
    );
  }

  return {
    subquery,
    selectColumns: splitSqlList(selectMatch[1]).map(selectColumnName),
    groupByColumns: splitSqlList(groupByRaw),
  };
}

function splitSqlList(list: string): string[] {
  const items: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of list) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      const item = current.trim();
      if (item) items.push(item);
      current = "";
      continue;
    }
    current += char;
  }
  const last = current.trim();
  if (last) items.push(last);
  return items;
}

function selectColumnName(expr: string): string {
  const asMatch = expr.match(/\bas\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/i);
  if (asMatch) return asMatch[1];
  const bare = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
  if (bare) return bare[1];
  return expr;
}

function isAggregateSelect(expr: string): boolean {
  return /\bavg\s*\(/i.test(expr);
}

function assertGroupByMatchesSelect(sql: string) {
  const { groupByColumns, subquery } = parseInnerScoresAggregation(sql);

  const selectExprs = (() => {
    const match = subquery.match(/^SELECT\s+([\s\S]*?)\s+FROM\s+scores/i);
    if (!match) return [];
    return splitSqlList(match[1]);
  })();

  const nonAggregateSelect = selectExprs
    .filter((expr) => !isAggregateSelect(expr))
    .map(selectColumnName);

  expect(
    groupByColumns,
    "inner scores GROUP BY must not include execution_trace_id unless it is also selected; it is not part of the export score identity",
  ).not.toContain("execution_trace_id");

  for (const column of groupByColumns) {
    expect(
      nonAggregateSelect,
      `GROUP BY column ${column} must be in the inner SELECT list`,
    ).toContain(column);
  }

  for (const column of nonAggregateSelect) {
    expect(
      groupByColumns,
      `selected dimension ${column} must appear in the inner GROUP BY`,
    ).toContain(column);
  }
}

async function capturedExportQuery(
  run: () => Promise<unknown>,
): Promise<string> {
  mocks.queryClickhouseStream.mockReset();
  mocks.queryClickhouseStream.mockImplementation(() => emptyRows());
  await run();
  expect(mocks.queryClickhouseStream).toHaveBeenCalled();
  const arg = mocks.queryClickhouseStream.mock.calls[0]?.[0] as {
    query?: string;
  };
  expect(arg?.query).toEqual(expect.any(String));
  return arg.query as string;
}

describe("batch export scores aggregation SQL", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.getDistinctScoreNames.mockResolvedValue([]);
    mocks.shouldSkipScoresDedup.mockReturnValue(false);
    mocks.shouldSkipObservationsFinal.mockResolvedValue(false);
  });

  it("detects the historical ClickHouse error shape from #13982", () => {
    // Exact inner query shape reported on the issue: GROUP BY includes
    // execution_trace_id, but the SELECT list does not.
    const buggySql = `
      FROM (
        SELECT project_id, trace_id, name, data_type, string_value, avg(value) AS avg_value
        FROM scores FINAL
        WHERE project_id = 'cmr4rl0vp0006n907cbapptn2'
        GROUP BY project_id, trace_id, name, data_type, string_value, execution_trace_id
      ) tmp
    `;

    const parsed = parseInnerScoresAggregation(buggySql);
    expect(parsed.groupByColumns).toContain("execution_trace_id");
    expect(parsed.selectColumns).not.toContain("execution_trace_id");
    expect(() => assertGroupByMatchesSelect(buggySql)).toThrow();
  });

  it("does not GROUP BY execution_trace_id in the traces export scores subquery", async () => {
    const query = await capturedExportQuery(() =>
      getTraceStream({ ...streamProps, filter: [] }),
    );
    assertGroupByMatchesSelect(query);
  });

  it("does not GROUP BY execution_trace_id in the observations export scores subquery", async () => {
    const query = await capturedExportQuery(() =>
      getObservationStream({ ...streamProps, filter: [] }),
    );
    assertGroupByMatchesSelect(query);
  });
});
