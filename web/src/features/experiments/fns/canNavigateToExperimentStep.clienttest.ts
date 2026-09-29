import { describe, expect, it } from "vitest";

import { canNavigateToExperimentStep } from "./canNavigateToExperimentStep";

describe("canNavigateToExperimentStep", () => {
  it("blocks the review step while evaluator assignments are loading", () => {
    expect(
      canNavigateToExperimentStep({
        targetStepId: "review",
        useV2Evaluators: true,
        isLoadingAssignments: true,
      }),
    ).toBe(false);
  });

  it("allows other navigation while evaluator assignments are loading", () => {
    expect(
      canNavigateToExperimentStep({
        targetStepId: "details",
        useV2Evaluators: true,
        isLoadingAssignments: true,
      }),
    ).toBe(true);
  });
});
