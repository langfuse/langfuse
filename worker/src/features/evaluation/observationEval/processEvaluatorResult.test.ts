import { describe, expect, it, vi } from "vitest";

import { createTestObservation } from "./__tests__/fixtures";
import { processEvaluatorResult } from "./processEvaluatorResult";

const observation = createTestObservation({
  project_id: "project-1",
});
const input = {
  projectId: "project-1",
  evaluatorId: "evaluator-1",
  upstreamJobExecutionId: "execution-1",
  observation,
  scores: [{ name: "quality", dataType: "NUMERIC" as const, value: 0.9 }],
};

describe("processEvaluatorResult", () => {
  it("does not schedule when the project has no matching rules", async () => {
    const scheduleEvals = vi.fn();
    await processEvaluatorResult(input, {
      fetchRules: vi.fn().mockResolvedValue([]),
      scheduleEvals,
    });

    expect(scheduleEvals).not.toHaveBeenCalled();
  });

  it("schedules matching rules from the evaluator result", async () => {
    const rules = [{ id: "rule-1" }] as never;
    const scheduleEvals = vi.fn();

    await processEvaluatorResult(input, {
      fetchRules: vi.fn().mockResolvedValue(rules),
      scheduleEvals,
    });

    expect(scheduleEvals).toHaveBeenCalledWith(
      expect.objectContaining({
        observation,
        rules,
        scores: input.scores,
        upstreamJobExecutionId: input.upstreamJobExecutionId,
      }),
    );
  });
});
