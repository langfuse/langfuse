import { describe, expect, it, vi } from "vitest";

import { createTestObservation } from "./__tests__/fixtures";
import { processEvaluatorResult } from "./processEvaluatorResult";

const event = {
  projectId: "project-1",
  evaluatorId: "evaluator-1",
  upstreamJobExecutionId: "execution-1",
  observationS3Path: "observations/observation-1.json",
  scores: [{ name: "quality", dataType: "NUMERIC" as const, value: 0.9 }],
};

describe("processEvaluatorResult", () => {
  it("does not download the observation when the project has no matching rules", async () => {
    const downloadObservation = vi.fn();

    await processEvaluatorResult(event, {
      downloadObservation,
      fetchRules: vi.fn().mockResolvedValue([]),
      scheduleEvals: vi.fn(),
    });

    expect(downloadObservation).not.toHaveBeenCalled();
  });

  it("schedules matching rules from the queued evaluator result", async () => {
    const observation = createTestObservation({
      project_id: event.projectId,
    });
    const rules = [{ id: "rule-1" }] as never;
    const scheduleEvals = vi.fn();

    await processEvaluatorResult(event, {
      downloadObservation: vi
        .fn()
        .mockResolvedValue(JSON.stringify(observation)),
      fetchRules: vi.fn().mockResolvedValue(rules),
      scheduleEvals,
    });

    expect(scheduleEvals).toHaveBeenCalledWith(
      expect.objectContaining({
        observation,
        rules,
        scores: event.scores,
        upstreamJobExecutionId: event.upstreamJobExecutionId,
      }),
    );
  });
});
