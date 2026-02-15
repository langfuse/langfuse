import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  EvalTargetObject,
  type ObservationBatchEvaluationConfig,
} from "@langfuse/shared";
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
import {
  processBatchedObservationEval,
  toObservationForEval,
} from "./processBatchedObservationEval";

describe("toObservationForEval", () => {
  const projectId = "proj-1";

  const fullRow = {
    id: "obs-1",
    trace_id: "trace-1",
    trace_name: "my-trace",
    type: "GENERATION",
    name: "gen-step",
    environment: "production",
    version: "1.0",
    user_id: "user-1",
    session_id: "sess-1",
    level: "DEFAULT",
    status_message: null,
    prompt_name: "my-prompt",
    prompt_id: "prompt-1",
    prompt_version: 3,
    provided_model_name: "gpt-4",
    model_parameters: { temperature: 0.7 },
    provided_usage_details: { input: 100, output: 50 },
    usage_details: { input: 100, output: 50 },
    provided_cost_details: { input: 0.01, output: 0.02 },
    cost_details: { input: 0.01, output: 0.02 },
    total_cost: 0.03,
    input: { role: "user", content: "hello" },
    output: { role: "assistant", content: "hi" },
    metadata: { key: "value" },
    tags: ["tag1", "tag2"],
    release: "v1.0",
    parent_observation_id: "parent-1",
    tool_definitions: {},
    tool_calls: [],
    tool_call_names: [],
  };

  it("maps a full events row to the observation eval schema", () => {
    const result = toObservationForEval(fullRow, projectId);

    expect(result.span_id).toBe("obs-1");
    expect(result.trace_id).toBe("trace-1");
    expect(result.project_id).toBe(projectId);
    expect(result.parent_span_id).toBe("parent-1");
    expect(result.type).toBe("GENERATION");
    expect(result.name).toBe("gen-step");
    expect(result.environment).toBe("production");
    expect(result.tags).toEqual(["tag1", "tag2"]);
    expect(result.provided_model_name).toBe("gpt-4");
    expect(result.prompt_name).toBe("my-prompt");
    expect(result.prompt_version).toBe(3);
    expect(result.usage_details).toEqual({ input: 100, output: 50 });
    expect(result.cost_details).toEqual({
      input: 0.01,
      output: 0.02,
      total: 0.03,
    });
    // Both provided and computed map to same source
    expect(result.provided_usage_details).toEqual(result.usage_details);
    expect(result.provided_cost_details).toEqual(result.cost_details);
    // Tool fields are empty
    expect(result.tool_definitions).toEqual({});
    expect(result.tool_calls).toEqual([]);
    expect(result.tool_call_names).toEqual([]);
    expect(result.input).toEqual({ role: "user", content: "hello" });
    expect(result.output).toEqual({ role: "assistant", content: "hi" });
    expect(result.metadata).toEqual({ key: "value" });
  });

  it("handles null and missing optional fields", () => {
    const minimalRow = {
      id: "obs-2",
      trace_id: "trace-2",
      type: "SPAN",
      name: null,
      usage_details: {},
      cost_details: {},
      tags: null,
      input: null,
      output: null,
      metadata: null,
    };

    const result = toObservationForEval(minimalRow, projectId);

    expect(result.span_id).toBe("obs-2");
    expect(result.name).toBe("");
    expect(result.environment).toBe("default");
    expect(result.tags).toEqual([]);
    expect(result.input).toBeNull();
    expect(result.output).toBeNull();
    expect(result.metadata).toBeUndefined();
    expect(result.usage_details).toEqual({});
    expect(result.cost_details).toEqual({});
  });

  it("coerces string-formatted numbers in usageDetails", () => {
    const row = {
      id: "obs-3",
      trace_id: "trace-3",
      type: "GENERATION",
      usage_details: { input: "100", output: "50", invalid: "abc" },
      cost_details: {},
      tags: [],
    };

    const result = toObservationForEval(row, projectId);

    expect(result.usage_details).toEqual({ input: 100, output: 50 });
  });

  it("throws for null or non-object records", () => {
    expect(() => toObservationForEval(null, projectId)).toThrow(
      "Invalid events table row",
    );
    expect(() => toObservationForEval(undefined, projectId)).toThrow(
      "Invalid events table row",
    );
    expect(() => toObservationForEval("string", projectId)).toThrow(
      "Invalid events table row",
    );
  });

  it("throws for records missing required identifiers", () => {
    expect(() => toObservationForEval({}, projectId)).toThrow(
      "Events row is missing required identifiers",
    );
    expect(() => toObservationForEval({ id: "obs-1" }, projectId)).toThrow(
      "Events row is missing required identifiers",
    );
  });

  it("handles malformed usageDetails gracefully", () => {
    const row = {
      id: "obs-4",
      trace_id: "trace-4",
      type: "SPAN",
      usage_details: "not-an-object",
      cost_details: [1, 2, 3],
      tags: [],
    };

    const result = toObservationForEval(row, projectId);

    expect(result.usage_details).toEqual({});
    expect(result.cost_details).toEqual({});
  });
});

describe("processBatchedObservationEval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bypasses evaluator filter and sampling when scheduling historical rows", async () => {
    const projectId = "project-1";
    const batchActionId = "batch-action-1";
    const config: ObservationBatchEvaluationConfig = {
      evaluators: [
        {
          evaluatorConfigId: "config-1",
          evaluatorName: "quality",
        },
      ],
    };

    const evaluators: ObservationEvalConfig[] = [
      {
        id: "config-1",
        projectId,
        filter: [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["SPAN"],
          },
        ],
        sampling: { toNumber: () => 0 } as ObservationEvalConfig["sampling"],
        evalTemplateId: "template-1",
        scoreName: "quality",
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
      },
    ];

    const observationStream = (async function* () {
      yield {
        id: "obs-1",
        trace_id: "trace-1",
        type: "GENERATION",
        name: "test",
        usage_details: {},
        cost_details: {},
        tags: [],
        input: "input",
        output: "output",
        metadata: {},
      };
    })();

    await processBatchedObservationEval({
      projectId,
      batchActionId,
      config,
      evaluators,
      observationStream,
    });

    expect(scheduleObservationEvals).toHaveBeenCalledTimes(1);
    expect(scheduleObservationEvals).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoreConfigTargeting: true,
      }),
    );
    expect(
      (prisma.batchAction.update as Mock).mock.calls.length,
    ).toBeGreaterThan(0);
  });
});
