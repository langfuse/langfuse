import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("./clickhouse", () => ({
  queryClickhouse: mockQueryClickhouse,
  queryClickhouseStream: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  commandClickhouse: vi.fn(),
  upsertClickhouse: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  clickhouseCompliantRandomCharacters: vi.fn(() => "x"),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
}));

// Break the query-options -> server-barrel import cycle that otherwise fails
// module initialization when the graph is entered from this repository file.
vi.mock("../queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
}));

import {
  getAggregatedScoresForPromptsFromEvents,
  getScoresForExperimentItems,
} from "../index";

const FIXED_PROJECT_ID = "golden-project";
const FIXED_EXPERIMENT_IDS = ["exp-a", "exp-b"];
const FIXED_PROMPT_IDS = ["prompt-a", "prompt-b"];
const FIXED_FROM_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");
const FIXED_TO_TIMESTAMP = new Date("2026-01-31T23:59:59.000Z");

// Dynamic import: a static harness import from this file re-enters the
// server barrel while scores.ts is still initializing. Top-level await is
// also unavailable — shared compiles as CommonJS.
async function snapshotCapturedQuery() {
  const { clickhouseFormatAvailable, formatSql, normalizeParams } =
    await import("../query-ast/goldenHarness.js");

  if (!clickhouseFormatAvailable()) {
    throw new Error(
      "[golden-harness] `clickhouse format` unavailable. Install clickhouse-local to run these tests.",
    );
  }

  expect(mockQueryClickhouse).toHaveBeenCalledTimes(1);
  const { query, params } = mockQueryClickhouse.mock.calls[0][0] as {
    query: string;
    params: Record<string, unknown>;
  };
  return normalizeParams(formatSql(query), params);
}

describe("golden: scores.getScoresForExperimentItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  it("experimentIds set", async () => {
    await getScoresForExperimentItems(FIXED_PROJECT_ID, FIXED_EXPERIMENT_IDS);

    expect(await snapshotCapturedQuery()).toMatchSnapshot();
  });
});

describe("golden: scores.getAggregatedScoresForPromptsFromEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  const variants: Array<{
    relation: "observation" | "trace";
    fromTimestamp?: Date;
    toTimestamp?: Date;
  }> = [
    { relation: "observation" },
    { relation: "trace" },
    {
      relation: "observation",
      fromTimestamp: FIXED_FROM_TIMESTAMP,
      toTimestamp: FIXED_TO_TIMESTAMP,
    },
    { relation: "trace", fromTimestamp: FIXED_FROM_TIMESTAMP },
  ];

  for (const variant of variants) {
    const bounds = [
      variant.fromTimestamp ? "from" : null,
      variant.toTimestamp ? "to" : null,
    ]
      .filter(Boolean)
      .join("+");
    const name = `relation=${variant.relation} time=${bounds || "unset"}`;

    it(name, async () => {
      await getAggregatedScoresForPromptsFromEvents(
        FIXED_PROJECT_ID,
        FIXED_PROMPT_IDS,
        variant.relation,
        {
          fromTimestamp: variant.fromTimestamp,
          toTimestamp: variant.toTimestamp,
        },
      );

      expect(await snapshotCapturedQuery()).toMatchSnapshot();
    });
  }
});
