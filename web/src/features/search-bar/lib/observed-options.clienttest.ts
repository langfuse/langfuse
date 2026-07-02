import {
  scoreTypeContextFromObserved,
  toObservedOptions,
} from "@/src/features/search-bar/lib/observed-options";

describe("toObservedOptions", () => {
  it("removes boolean score names from legacy numeric score options", () => {
    const observed = toObservedOptions(
      {
        scores_avg: [{ value: "accuracy" }, { value: "flag" }],
        score_categories: {
          sentiment: ["positive", "negative"],
        },
        score_booleans: [{ value: "flag" }],
        trace_scores_avg: [{ value: "traceAccuracy" }, { value: "traceFlag" }],
        trace_score_categories: {
          traceSentiment: ["positive", "negative"],
        },
        trace_score_booleans: [{ value: "traceFlag" }],
      },
      false,
    );

    expect(observed?.scores_avg).toEqual([{ value: "accuracy" }]);
    expect(observed?.score_categories).toEqual([{ value: "sentiment" }]);
    expect(observed?.["score_categories.sentiment"]).toEqual([
      { value: "positive" },
      { value: "negative" },
    ]);
    expect(observed?.score_booleans).toEqual([{ value: "flag" }]);

    expect(observed?.trace_scores_avg).toEqual([{ value: "traceAccuracy" }]);
    expect(observed?.trace_score_categories).toEqual([
      { value: "traceSentiment" },
    ]);
    expect(observed?.["trace_score_categories.traceSentiment"]).toEqual([
      { value: "positive" },
      { value: "negative" },
    ]);
    expect(observed?.trace_score_booleans).toEqual([{ value: "traceFlag" }]);
  });
});

describe("scoreTypeContextFromObserved", () => {
  it("uses the normalized observed score type sets", () => {
    const observed = toObservedOptions(
      {
        scores_avg: [{ value: "flag" }],
        score_booleans: [{ value: "flag" }],
      },
      false,
    );

    const scoreTypes = scoreTypeContextFromObserved(observed);

    expect(scoreTypes.numericScoreNames?.has("flag")).toBe(false);
    expect(scoreTypes.booleanScoreNames?.has("flag")).toBe(true);
  });
});
