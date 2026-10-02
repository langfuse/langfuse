import { describe, expect, it } from "vitest";
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
