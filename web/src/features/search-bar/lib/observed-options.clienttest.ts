import { describe, expect, it } from "vitest";

import {
  MAX_SCORE_NAME_LENGTH,
  MAX_SCORE_NAMES_PER_TYPE,
  observedScoreNamesFromOptions,
} from "./observed-options";

describe("observedScoreNamesFromOptions", () => {
  it("returns undefined while the observed map is still loading", () => {
    expect(observedScoreNamesFromOptions(undefined)).toBeUndefined();
  });

  it("keeps a set undefined until its column has loaded, [] when loaded empty", () => {
    // scores_avg loaded with names, score_categories loaded but empty, the two
    // trace columns not loaded yet. Only loaded sets are defined — the server
    // must not enforce a set whose column simply hasn't arrived.
    const names = observedScoreNamesFromOptions({
      scores_avg: [{ value: "helpfulness-rating" }, { value: "accuracy" }],
      score_categories: [],
    });
    expect(names).toEqual({
      numeric: ["helpfulness-rating", "accuracy"],
      categorical: [],
      traceNumeric: undefined,
      traceCategorical: undefined,
    });
  });

  it("sends an over-cap set as undefined instead of truncating it", () => {
    // A truncated set would make the un-sent names look unknown and get their
    // filters dropped; skipping enforcement is the safe degradation.
    const names = observedScoreNamesFromOptions({
      scores_avg: Array.from(
        { length: MAX_SCORE_NAMES_PER_TYPE + 1 },
        (_, i) => ({
          value: `score-${i}`,
        }),
      ),
      score_categories: [{ value: "sentiment" }],
    });
    expect(names?.numeric).toBeUndefined();
    expect(names?.categorical).toEqual(["sentiment"]);
  });

  it("sends a set containing an overlong name as undefined", () => {
    const names = observedScoreNamesFromOptions({
      scores_avg: [{ value: "x".repeat(MAX_SCORE_NAME_LENGTH + 1) }],
    });
    expect(names?.numeric).toBeUndefined();
  });
});
