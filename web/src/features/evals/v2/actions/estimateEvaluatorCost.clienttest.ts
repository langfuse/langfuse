import { describe, expect, it, vi } from "vitest";

import { estimateEvaluatorCost } from "./estimateEvaluatorCost";

const testInput = {
  projectId: "project-1",
  prompt: "Rate {{input}}",
  mapping: [],
};

describe("estimateEvaluatorCost", () => {
  it("tests the matching observation and returns its estimated cost", async () => {
    const runTest = vi.fn().mockResolvedValue({
      success: true,
      estimatedCostUsd: 0.003,
    });

    await expect(
      estimateEvaluatorCost({
        testInput,
        getSample: vi.fn().mockResolvedValue({
          id: "observation-1",
          traceId: "trace-1",
          startTime: new Date("2026-07-22T12:00:00.000Z"),
        }),
        runTest,
      }),
    ).resolves.toBe(0.003);
    expect(runTest).toHaveBeenCalledWith({
      ...testInput,
      observationId: "observation-1",
      traceId: "trace-1",
      observationStartTime: new Date("2026-07-22T12:00:00.000Z"),
    });
  });

  it("does not run a test without a matching observation", async () => {
    const runTest = vi.fn();

    await expect(
      estimateEvaluatorCost({
        testInput,
        getSample: vi.fn().mockResolvedValue(null),
        runTest,
      }),
    ).resolves.toBeNull();
    expect(runTest).not.toHaveBeenCalled();
  });
});
