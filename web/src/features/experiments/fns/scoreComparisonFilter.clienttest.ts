import { type AggregatedScoreData } from "@langfuse/shared";
import {
  decodeScoreComparisonFilter,
  encodeScoreComparisonFilter,
  matchesScoreComparisonFilter,
} from "./scoreComparisonFilter";

const numeric = (value: number): AggregatedScoreData => ({
  type: "NUMERIC",
  values: [value],
  average: value,
});

const categorical = (value: string): AggregatedScoreData => ({
  type: "CATEGORICAL",
  values: [value],
  valueCounts: [{ value, count: 1 }],
});

describe("matchesScoreComparisonFilter", () => {
  it("keeps only the items the experiment you opened scored lower on", () => {
    const lower = (baseline: number, comparison: number) =>
      matchesScoreComparisonFilter({
        operator: "lower",
        dataType: "NUMERIC",
        baseline: numeric(baseline),
        comparison: numeric(comparison),
      });

    expect(lower(0.2, 0.9)).toBe(true);
    expect(lower(0.9, 0.2)).toBe(false);
    expect(lower(0.5, 0.5)).toBe(false);
  });

  it("never keeps an item only one of the two experiments scored", () => {
    for (const operator of ["lower", "higher", "differs"] as const) {
      expect(
        matchesScoreComparisonFilter({
          operator,
          dataType: "NUMERIC",
          baseline: numeric(0.2),
          comparison: null,
        }),
      ).toBe(false);
      expect(
        matchesScoreComparisonFilter({
          operator,
          dataType: "NUMERIC",
          baseline: undefined,
          comparison: numeric(0.2),
        }),
      ).toBe(false);
    }
  });

  it("reads a boolean as false < true", () => {
    expect(
      matchesScoreComparisonFilter({
        operator: "lower",
        dataType: "BOOLEAN",
        baseline: categorical("false"),
        comparison: categorical("true"),
      }),
    ).toBe(true);
  });

  it("only answers 'differs' for a categorical score, which has no order", () => {
    const args = {
      dataType: "CATEGORICAL" as const,
      baseline: categorical("weak"),
      comparison: categorical("grounded"),
    };
    expect(matchesScoreComparisonFilter({ ...args, operator: "lower" })).toBe(
      false,
    );
    expect(matchesScoreComparisonFilter({ ...args, operator: "differs" })).toBe(
      true,
    );
    expect(
      matchesScoreComparisonFilter({
        ...args,
        operator: "differs",
        comparison: categorical("weak"),
      }),
    ).toBe(false);
  });
});

describe("score comparison filter URL state", () => {
  it("round-trips through the URL and rejects anything malformed", () => {
    const filter = {
      level: "trace" as const,
      scoreKey: "groundedness-EVAL-NUMERIC",
      operator: "lower" as const,
      comparisonExperimentId: "1b0a2c3d-4e5f",
    };

    expect(
      decodeScoreComparisonFilter(encodeScoreComparisonFilter(filter)),
    ).toEqual(filter);
    expect(decodeScoreComparisonFilter("trace:key:sideways:id")).toBeNull();
    expect(decodeScoreComparisonFilter("session:key:lower:id")).toBeNull();
    expect(decodeScoreComparisonFilter("")).toBeNull();
  });
});
