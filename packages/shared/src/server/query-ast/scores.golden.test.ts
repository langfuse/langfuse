import { describe, expect, it } from "vitest";

import {
  clickhouseFormatAvailable,
  formatSql,
  normalizeParams,
} from "./goldenHarness";
import {
  compileAggregatedScoresForPromptsFromEvents,
  compileScoresForExperimentItems,
} from "./scoresQueries";

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

function snapshotCompiled(compiled: {
  sql: string;
  params: Record<string, unknown>;
}) {
  return normalizeParams(formatSql(compiled.sql), compiled.params);
}

describeWithClickhouse("golden: scores.getScoresForExperimentItems", () => {
  it("experimentIds set", () => {
    expect(
      snapshotCompiled(
        compileScoresForExperimentItems(
          { projectId: FIXED_PROJECT_ID },
          FIXED_EXPERIMENT_IDS,
        ),
      ),
    ).toMatchSnapshot();
  });
});

describeWithClickhouse(
  "golden: scores.getAggregatedScoresForPromptsFromEvents",
  () => {
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

      it(name, () => {
        expect(
          snapshotCompiled(
            compileAggregatedScoresForPromptsFromEvents(
              { projectId: FIXED_PROJECT_ID },
              FIXED_PROMPT_IDS,
              variant.relation,
              {
                fromTimestamp: variant.fromTimestamp,
                toTimestamp: variant.toTimestamp,
              },
            ),
          ),
        ).toMatchSnapshot();
      });
    }
  },
);
