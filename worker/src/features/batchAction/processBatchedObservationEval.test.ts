import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { EvalTargetObject } from "@langfuse/shared";
import { type ObservationEvalConfig } from "../evaluation/observationEval";

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    batchAction: {
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock("../evaluation/observationEval", () => ({
  createObservationEvalSchedulerDeps: vi.fn(() => ({ deps: true })),
  scheduleObservationEvals: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@langfuse/shared/src/db";
import { scheduleObservationEvals } from "../evaluation/observationEval";
import { processBatchedObservationEval } from "./processBatchedObservationEval";

describe("processBatchedObservationEval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes evaluators with match-all filter and sampling to the scheduler", async () => {
    const projectId = "project-1";
    const batchActionId = "batch-action-1";

    // Evaluators should already have filter=[] and sampling=1 set by the
    // caller (handleBatchActionJob), so the scheduler applies its normal
    // targeting logic and every observation matches.
    const evaluators: ObservationEvalConfig[] = [
      {
        id: "config-1",
        projectId,
        filter: [],
        sampling: { toNumber: () => 1 } as ObservationEvalConfig["sampling"],
        evalTemplateId: "template-1",
        scoreName: "quality",
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
      },
    ];

    const remappedRow: Record<string, unknown> = {
      span_id: "obs-1",
      trace_id: "trace-1",
      project_id: projectId,
      parent_span_id: null,
      type: "GENERATION",
      name: "test",
      usage_details: {},
      cost_details: {},
      provided_usage_details: {},
      provided_cost_details: {},
      tags: [],
      input: "input",
      output: "output",
      metadata: {},
    };

    const observationStream = (async function* () {
      yield remappedRow;
    })();

    await processBatchedObservationEval({
      projectId,
      batchActionId,
      evaluators,
      observationStream,
    });

    expect(scheduleObservationEvals).toHaveBeenCalledTimes(1);
    expect(scheduleObservationEvals).toHaveBeenCalledWith(
      expect.objectContaining({
        configs: evaluators,
      }),
    );
    expect(
      (prisma.batchAction.update as Mock).mock.calls.length,
    ).toBeGreaterThan(0);
  });
});
