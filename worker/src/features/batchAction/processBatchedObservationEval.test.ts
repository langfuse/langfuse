import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  EvalTargetObject,
  EvalTemplateType,
  JobConfigState,
} from "@langfuse/shared";
import { type ObservationEvalRule } from "../evaluation/observationEval";

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
    const evaluators: ObservationEvalRule[] = [
      {
        id: "config-1",
        projectId,
        filter: [],
        sampling: { toNumber: () => 1 } as ObservationEvalRule["sampling"],
        evalTemplateId: "template-1",
        evalTemplate: { type: EvalTemplateType.LLM_AS_JUDGE },
        scoreName: "quality",
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        status: JobConfigState.ACTIVE,
        blockedAt: null,
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
        executionMode: "MANUAL",
        executionScopeId: batchActionId,
      }),
    );
    expect(
      (prisma.batchAction.update as Mock).mock.calls.length,
    ).toBeGreaterThan(0);
  });

  it("passes stable evaluator assignments to the scheduler for v2 batches", async () => {
    const projectId = "project-1";
    const evaluators: ObservationEvalRule[] = [
      {
        id: "evaluator-1",
        // A standalone evaluator falls back to its own id as the execution anchor.
        ruleId: null,
        projectId,
        filter: [],
        sampling: { toNumber: () => 1 } as ObservationEvalRule["sampling"],
        status: JobConfigState.ACTIVE,
        targetObject: EvalTargetObject.EVENT,
        assignments: [
          {
            id: "evaluator-1",
            evaluatorId: "evaluator-1",
            variableMapping: null,
            evaluator: {
              id: "evaluator-1",
              projectId,
              type: EvalTemplateType.LLM_AS_JUDGE,
              blockedAt: null,
              versions: [{ id: "evaluator-version-1", variableMapping: [] }],
            },
          },
        ],
      },
    ];
    const observationStream = (async function* () {
      yield {
        span_id: "obs-v2",
        trace_id: "trace-v2",
        project_id: projectId,
        parent_span_id: null,
        type: "GENERATION",
        name: "v2-test",
        usage_details: {},
        cost_details: {},
        provided_usage_details: {},
        provided_cost_details: {},
        tags: [],
        input: "input",
        output: "output",
        metadata: {},
      };
    })();

    await processBatchedObservationEval({
      projectId,
      batchActionId: "batch-action-v2",
      evaluators,
      evaluatorLabels: ["Quality"],
      observationStream,
    });

    expect(scheduleObservationEvals).toHaveBeenCalledWith(
      expect.objectContaining({
        configs: evaluators,
        executionMode: "MANUAL",
        executionScopeId: "batch-action-v2",
      }),
    );
  });

  it("derives tool_call_count from tool_call_names in batch records", async () => {
    const projectId = "project-1";
    const batchActionId = "batch-action-2";

    const evaluators: ObservationEvalRule[] = [
      {
        id: "config-1",
        projectId,
        filter: [],
        sampling: { toNumber: () => 1 } as ObservationEvalRule["sampling"],
        evalTemplateId: "template-1",
        evalTemplate: { type: EvalTemplateType.LLM_AS_JUDGE },
        scoreName: "quality",
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        status: JobConfigState.ACTIVE,
        blockedAt: null,
      },
    ];

    const rowWithToolCalls: Record<string, unknown> = {
      span_id: "obs-2",
      trace_id: "trace-2",
      project_id: projectId,
      parent_span_id: null,
      type: "GENERATION",
      name: "tool-test",
      usage_details: {},
      cost_details: {},
      provided_usage_details: {},
      provided_cost_details: {},
      tags: [],
      input: "input",
      output: "output",
      metadata: {},
      tool_call_names: ["search", "calculator", "fetch"],
    };

    const rowWithoutToolCalls: Record<string, unknown> = {
      span_id: "obs-3",
      trace_id: "trace-3",
      project_id: projectId,
      parent_span_id: null,
      type: "GENERATION",
      name: "no-tool-test",
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
      yield rowWithToolCalls;
      yield rowWithoutToolCalls;
    })();

    await processBatchedObservationEval({
      projectId,
      batchActionId,
      evaluators,
      observationStream,
    });

    expect(scheduleObservationEvals).toHaveBeenCalledTimes(2);

    const firstCall = (scheduleObservationEvals as Mock).mock.calls[0][0];
    expect(firstCall.observation.tool_call_count).toBe(3);
    expect(firstCall.observation.tool_call_names).toEqual([
      "search",
      "calculator",
      "fetch",
    ]);

    const secondCall = (scheduleObservationEvals as Mock).mock.calls[1][0];
    expect(secondCall.observation.tool_call_count).toBe(0);
  });
});
