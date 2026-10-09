import { beforeEach, describe, expect, it, vi } from "vitest";

const mockQueryClickhouse = vi.hoisted(() => vi.fn());

vi.mock("./clickhouse", () => ({
  queryClickhouse: mockQueryClickhouse,
  commandClickhouse: vi.fn(),
  queryClickhouseStream: vi.fn(),
  queryClickhouseStreamRawText: vi.fn(),
  queryClickhouseExecRaw: vi.fn(),
  parseClickhouseUTCDateTimeFormat: vi.fn(),
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS: {},
  clickhouseCompliantRandomCharacters: vi.fn(() => "x"),
}));

vi.mock("../queries/clickhouse-sql/query-options", () => ({
  shouldSkipObservationsFinal: vi.fn().mockResolvedValue(false),
}));

import { getExperimentItemsBatchIO } from "../index";
import { toAgnosticScoreFilterOptions } from "./experimentScoreOptions";
import { experimentCols } from "../tableMappings/mapExperimentTable";
import { matchesUiColumnMapping } from "../../tableDefinitions/types";

const options = (
  partial: Partial<Parameters<typeof toAgnosticScoreFilterOptions>[0]> = {},
): Parameters<typeof toAgnosticScoreFilterOptions>[0] => ({
  numeric: [],
  categorical: [],
  boolean: [],
  scoreColumns: [],
  ...partial,
});

describe("getExperimentItemsBatchIO bounded full I/O", () => {
  const params = {
    projectId: "project-1",
    itemIds: ["item-1"],
    baseExperimentId: "baseline",
    compExperimentIds: ["comparison"],
  };

  beforeEach(() => {
    mockQueryClickhouse.mockReset();
    mockQueryClickhouse.mockResolvedValue([]);
  });

  it("reads intact bounded I/O from the full table and identifies previews", async () => {
    const input = JSON.stringify({
      messages: [{ role: "user", content: "x".repeat(1500) }],
    });
    mockQueryClickhouse.mockResolvedValue([
      {
        item_id: "item-1",
        experiment_id: "comparison",
        input: "comparison preview",
        input_length: 20001,
        output: "output preview",
        output_length: 20001,
        expected_output: "comparison expected",
        expected_output_length: 19,
      },
      {
        item_id: "item-1",
        experiment_id: "baseline",
        input,
        input_length: input.length,
        output: "baseline output",
        output_length: 15,
        expected_output: "expected preview",
        expected_output_length: 20001,
      },
    ]);

    const result = await getExperimentItemsBatchIO({
      ...params,
      ioSizeCap: { inlineChars: 10000, previewChars: 4000 },
    });

    expect(result[0]).toMatchObject({
      input,
      inputTruncated: false,
      expectedOutput: "expected preview",
      expectedOutputTruncated: true,
      outputs: [
        {
          experimentId: "comparison",
          output: "output preview",
          outputTruncated: true,
        },
        {
          experimentId: "baseline",
          output: "baseline output",
          outputTruncated: false,
        },
      ],
    });
    expect(JSON.parse(result[0].input!)).toHaveProperty("messages");
    const { query, params: queryParams } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).toContain("events_full");
    expect(query).toContain("lengthUTF8(e.input)");
    expect(query).toContain("lengthUTF8(e.experiment_item_expected_output)");
    expect(query).toContain("expected_output_length");
    expect(Object.values(queryParams)).toContain("project-1");
    expect(Object.values(queryParams)).toContainEqual(["item-1"]);
  });

  it("keeps the compact query and response shape for callers without a size cap", async () => {
    mockQueryClickhouse.mockResolvedValue([
      {
        item_id: "item-1",
        experiment_id: "baseline",
        input: "input",
        output: "output",
        expected_output: "expected",
      },
    ]);
    const result = await getExperimentItemsBatchIO(params);
    expect(result).toEqual([
      {
        itemId: "item-1",
        input: "input",
        expectedOutput: "expected",
        outputs: [{ experimentId: "baseline", output: "output" }],
      },
    ]);
    const { query, params: queryParams } = mockQueryClickhouse.mock.calls[0][0];
    expect(query).toContain("events_core");
    expect(query).not.toContain("input_length");
    expect(queryParams.truncateLength).toBe(1000);
  });
});

describe("toAgnosticScoreFilterOptions", () => {
  it("unions the names across levels and tags each with the levels it exists at", () => {
    const result = toAgnosticScoreFilterOptions(
      options({ numeric: ["accuracy", "obs-only"] }),
      options({ numeric: ["accuracy", "trace-only"] }),
    );

    expect(result.scores_avg).toEqual(["accuracy", "obs-only", "trace-only"]);
    expect(result.score_name_levels_numeric).toEqual({
      accuracy: ["observation", "trace"],
      "obs-only": ["observation"],
      "trace-only": ["trace"],
    });
  });

  it("keeps the level maps per data type, so a name reused across types is not mislabeled", () => {
    const result = toAgnosticScoreFilterOptions(
      options({ numeric: ["quality"] }),
      options({ categorical: [{ label: "quality", values: ["good"] }] }),
    );

    // Same name, different data type, different level: the numeric facet must
    // not claim it also exists at trace level.
    expect(result.score_name_levels_numeric).toEqual({
      quality: ["observation"],
    });
    expect(result.score_name_levels_categorical).toEqual({
      quality: ["trace"],
    });
  });

  it("unions categorical values of a name present at both levels", () => {
    const result = toAgnosticScoreFilterOptions(
      options({ categorical: [{ label: "tone", values: ["warm", "flat"] }] }),
      options({ categorical: [{ label: "tone", values: ["flat", "sharp"] }] }),
    );

    expect(result.score_categories).toEqual([
      { label: "tone", values: ["flat", "sharp", "warm"] },
    ]);
  });

  it("dedupes a score column that exists at both levels", () => {
    const column = {
      name: "accuracy",
      dataType: "NUMERIC" as const,
      source: "API",
    };

    const result = toAgnosticScoreFilterOptions(
      options({ scoreColumns: [column] }),
      options({ scoreColumns: [column] }),
    );

    expect(result.score_columns).toEqual([column]);
  });
});

describe("experiments table score column mapping", () => {
  // Filters whose column the repository cannot resolve are dropped silently, so
  // a lost alias would turn an existing saved view into "no filter at all".
  it.each([
    ["obs_scores_avg", "scores_avg"],
    ["obs_score_categories", "score_categories"],
    ["obs_score_booleans", "score_booleans"],
  ])("resolves the legacy %s alias onto %s", (legacy, canonical) => {
    const match = experimentCols.find((column) =>
      matchesUiColumnMapping(column, legacy),
    );

    expect(match?.uiTableId).toBe(canonical);
  });

  it.each(["scores_avg", "score_categories", "score_booleans"])(
    "resolves the canonical %s column",
    (canonical) => {
      const match = experimentCols.find((column) =>
        matchesUiColumnMapping(column, canonical),
      );

      expect(match?.uiTableId).toBe(canonical);
    },
  );
});
