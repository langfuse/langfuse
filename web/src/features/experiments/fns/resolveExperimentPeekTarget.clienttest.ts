import { resolveExperimentPeekTarget } from "./resolveExperimentPeekTarget";
import { type ExperimentItemData } from "../components/table/types";

const run = (experimentId: string, traceId: string): ExperimentItemData => ({
  experimentId,
  level: "DEFAULT",
  startTime: new Date("2026-08-25T09:00:00.000Z"),
  observationId: `obs-${experimentId}`,
  traceId,
  observationScores: {},
  traceScores: {},
});

const baseline = run("exp-baseline", "trace-baseline");
const comparison = run("exp-comparison", "trace-comparison");
const experiments = [baseline, comparison];

describe("resolveExperimentPeekTarget", () => {
  it("opens the clicked comparison run, not the baseline", () => {
    expect(
      resolveExperimentPeekTarget({
        experiments,
        baselineId: "exp-baseline",
        clickedExperimentId: "exp-comparison",
      }),
    ).toBe(comparison);
  });

  it("opens the baseline when the baseline's own cell was clicked", () => {
    expect(
      resolveExperimentPeekTarget({
        experiments,
        baselineId: "exp-baseline",
        clickedExperimentId: "exp-baseline",
      }),
    ).toBe(baseline);
  });

  it("falls back to the baseline for a click on the row itself", () => {
    expect(
      resolveExperimentPeekTarget({
        experiments,
        baselineId: "exp-baseline",
      }),
    ).toBe(baseline);
  });

  it("uses the first run as the primary trace when no baseline is selected", () => {
    expect(resolveExperimentPeekTarget({ experiments })).toBe(baseline);
  });

  // The regression that shipped the bug: clickability and target resolution
  // were derived from the output, so a run returning "" lost its trace.
  it("resolves a run that produced an empty output", () => {
    expect(
      resolveExperimentPeekTarget({
        experiments,
        baselineId: "exp-baseline",
        clickedExperimentId: "exp-comparison",
      }),
    ).toHaveProperty("traceId", "trace-comparison");
  });

  it("returns nothing when the clicked run did not run for the item", () => {
    expect(
      resolveExperimentPeekTarget({
        experiments: [baseline],
        baselineId: "exp-baseline",
        clickedExperimentId: "exp-comparison",
      }),
    ).toBeUndefined();
  });
});
