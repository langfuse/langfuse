import { describe, expect, it } from "vitest";
import { buildEvalExecutionMetadata } from "./evalExecutionMetadata";

describe("buildEvalExecutionMetadata", () => {
  it("identifies an evaluator test", () => {
    expect(
      buildEvalExecutionMetadata({
        type: "TEST",
        evaluatorId: "evaluator-1",
        targetTraceId: "trace-1",
        targetObservationId: "observation-1",
      }),
    ).toEqual({
      evaluator_id: "evaluator-1",
      evaluator_test: "true",
      target_trace_id: "trace-1",
      target_observation_id: "observation-1",
    });
  });
});
