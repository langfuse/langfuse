import { type AggregatedScoreData } from "@langfuse/shared";
import { summariseScoreColumn } from "./summariseScoreColumn";

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

/** One item several annotators scored, all picking the same value. */
const categoricalMulti = (
  value: string,
  count: number,
): AggregatedScoreData => ({
  type: "CATEGORICAL",
  values: Array.from({ length: count }, () => value),
  valueCounts: [{ value, count }],
});

describe("summariseScoreColumn", () => {
  it("averages a numeric column and counts the items behind it", () => {
    const summary = summariseScoreColumn({
      pairs: [
        { baseline: numeric(0.2), comparison: null },
        { baseline: numeric(0.4), comparison: null },
        { baseline: null, comparison: null },
      ],
      dataType: "NUMERIC",
      hasComparison: false,
    });

    expect(summary.baseline).toEqual({
      kind: "average",
      value: 0.30000000000000004,
      count: 2,
    });
    expect(summary.movement).toBeNull();
  });

  it("signs the delta and splits improved from regressed", () => {
    const summary = summariseScoreColumn({
      pairs: [
        { baseline: numeric(0.2), comparison: numeric(0.5) },
        { baseline: numeric(0.6), comparison: numeric(0.4) },
        { baseline: numeric(0.3), comparison: numeric(0.3) },
      ],
      dataType: "NUMERIC",
      hasComparison: true,
    });

    // The header belongs to the baseline, so the delta is baseline − comparison.
    expect(summary.delta).toBeCloseTo(-0.03333, 4);
    expect(summary.movement).toEqual({
      improved: 1,
      regressed: 1,
      unchanged: 1,
      changed: 0,
      notComparable: 0,
    });
  });

  // Pins the frame's direction so it cannot silently flip back: the run you
  // opened scoring higher than the run it is read against is an improvement.
  it("reads a baseline that scored higher as an improvement", () => {
    const summary = summariseScoreColumn({
      pairs: [
        { baseline: numeric(0.6), comparison: numeric(0.4) },
        { baseline: numeric(0.5), comparison: numeric(0.4) },
      ],
      dataType: "NUMERIC",
      hasComparison: true,
    });

    expect(summary.delta).toBeCloseTo(0.15, 4);
    expect(summary.movement).toMatchObject({ improved: 2, regressed: 0 });
  });

  it("never counts a missing score as a regression", () => {
    const summary = summariseScoreColumn({
      pairs: [
        // Item the comparison run never scored.
        { baseline: numeric(0.9), comparison: null },
        // Item this run never scored.
        { baseline: null, comparison: numeric(0.1) },
        // Item neither run scored.
        { baseline: null, comparison: null },
        { baseline: numeric(0.2), comparison: numeric(0.4) },
      ],
      dataType: "NUMERIC",
      hasComparison: true,
    });

    expect(summary.movement).toEqual({
      improved: 0,
      regressed: 1,
      unchanged: 0,
      changed: 0,
      notComparable: 3,
    });
    // The aggregates still describe the items each run did score.
    expect(summary.baseline).toMatchObject({ count: 2 });
    expect(summary.comparison).toMatchObject({ count: 2 });
  });

  it("reads a boolean column as a true-rate, false below true", () => {
    const summary = summariseScoreColumn({
      pairs: [
        { baseline: categorical("false"), comparison: categorical("true") },
        { baseline: categorical("true"), comparison: categorical("false") },
        { baseline: categorical("true"), comparison: categorical("true") },
        { baseline: categorical("true"), comparison: null },
      ],
      dataType: "BOOLEAN",
      hasComparison: true,
    });

    expect(summary.baseline).toEqual({
      kind: "trueRate",
      value: 0.75,
      count: 4,
    });
    expect(summary.comparison).toEqual({
      kind: "trueRate",
      value: 2 / 3,
      count: 3,
    });
    expect(summary.movement).toMatchObject({
      improved: 1,
      regressed: 1,
      unchanged: 1,
      notComparable: 1,
    });
  });

  it("reports a categorical column as a distribution, and its moves as changed", () => {
    const summary = summariseScoreColumn({
      pairs: [
        { baseline: categorical("grounded"), comparison: categorical("weak") },
        {
          baseline: categorical("grounded"),
          comparison: categorical("grounded"),
        },
        { baseline: categorical("weak"), comparison: categorical("grounded") },
      ],
      dataType: "CATEGORICAL",
      hasComparison: true,
    });

    expect(summary.baseline).toMatchObject({
      kind: "distribution",
      modalValue: "grounded",
      distribution: [
        { value: "grounded", count: 2 },
        { value: "weak", count: 1 },
      ],
    });
    // No order, so no direction — and therefore no delta.
    expect(summary.delta).toBeNull();
    expect(summary.movement).toEqual({
      improved: 0,
      regressed: 0,
      unchanged: 1,
      changed: 2,
      notComparable: 0,
    });
  });

  // The modal count and the total are printed as one fraction, so they have to
  // be the same unit. Pooling an item's raw values made a value out-count the
  // items it was printed over.
  it("counts a categorical column in items, not in raw values", () => {
    const summary = summariseScoreColumn({
      pairs: [
        { baseline: categoricalMulti("A", 3), comparison: null },
        { baseline: categorical("A"), comparison: null },
        { baseline: categorical("B"), comparison: null },
      ],
      dataType: "CATEGORICAL",
      hasComparison: false,
    });

    expect(summary.baseline).toEqual({
      kind: "distribution",
      modalValue: "A",
      distribution: [
        { value: "A", count: 2 },
        { value: "B", count: 1 },
      ],
      count: 3,
    });
  });
});
