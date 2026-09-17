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

const { clickhouseFormatAvailable, formatSql, normalizeParams } =
  await import("../query-ast/goldenHarness.js");

const FIXED_PROJECT_ID = "golden-project";
const FIXED_EXPERIMENT_IDS = ["exp-a", "exp-b"];
const FIXED_PROMPT_IDS = ["prompt-a", "prompt-b"];
const FIXED_FROM_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");
const FIXED_TO_TIMESTAMP = new Date("2026-01-31T23:59:59.000Z");

const describeWithClickhouse = clickhouseFormatAvailable()
  ? describe
  : describe.skip;

if (!clickhouseFormatAvailable()) {
  console.warn(
    "[golden-harness] `clickhouse format` unavailable — skipping golden SQL tests. Install clickhouse-local to run them.",
  );
}

function snapshotCapturedQuery() {
  expect(mockQueryClickhouse).toHaveBeenCalledTimes(1);
  const { query, params } = mockQueryClickhouse.mock.calls[0][0] as {
    query: string;
    params: Record<string, unknown>;
  };
  return normalizeParams(formatSql(query), params);
}

describeWithClickhouse("golden: scores.getScoresForExperimentItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  it("experimentIds set", async () => {
    await getScoresForExperimentItems(FIXED_PROJECT_ID, FIXED_EXPERIMENT_IDS);

    expect(snapshotCapturedQuery()).toMatchSnapshot();
  });
});

describeWithClickhouse(
  "golden: scores.getAggregatedScoresForPromptsFromEvents",
  () => {
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

        expect(snapshotCapturedQuery()).toMatchSnapshot();
      });
    }
  },
);
