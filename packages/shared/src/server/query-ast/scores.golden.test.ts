import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  capturedQueries,
  clickhouseFormatAvailable,
  normalizeCapturedQueries,
  resetCaptures,
} from "./goldenHarness";

vi.mock("../repositories/clickhouse", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../repositories/clickhouse")>();
  const { buildClickhouseMock } = await import("./goldenHarness.js");
  return buildClickhouseMock(actual);
});

import {
  getAggregatedScoresForPromptsFromEvents,
  getScoresForExperimentItems,
} from "../repositories/scores";

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

describeWithClickhouse("golden: scores.getScoresForExperimentItems", () => {
  beforeEach(() => resetCaptures());

  it("emits no query when experimentIds is empty", async () => {
    await getScoresForExperimentItems(FIXED_PROJECT_ID, []);
    expect(capturedQueries).toHaveLength(0);
  });

  it("experimentIds set", async () => {
    await getScoresForExperimentItems(FIXED_PROJECT_ID, FIXED_EXPERIMENT_IDS);
    expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
  });
});

describeWithClickhouse(
  "golden: scores.getAggregatedScoresForPromptsFromEvents",
  () => {
    beforeEach(() => resetCaptures());
    afterAll(() => resetCaptures());

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

        expect(normalizeCapturedQueries(capturedQueries)).toMatchSnapshot();
      });
    }
  },
);
