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

  it("identifies a rule-driven evaluator execution", () => {
    expect(
      buildEvalExecutionMetadata({
        type: "JOB",
        jobExecutionId: "job-1",
        jobConfigurationId: "rule-1",
        evaluationRuleId: "rule-1",
        assignmentId: "assignment-1",
        evaluatorId: "evaluator-1",
        evaluatorVersionId: "version-2",
        targetTraceId: "trace-1",
        targetObservationId: "observation-1",
        targetDatasetItemId: null,
      }),
    ).toEqual({
      job_execution_id: "job-1",
      rule_id: "rule-1",
      job_configuration_id: "rule-1",
      assignment_id: "assignment-1",
      evaluator_id: "evaluator-1",
      evaluator_version_id: "version-2",
      target_trace_id: "trace-1",
      target_observation_id: "observation-1",
    });
  });

  it("identifies a manual v2 evaluator execution without a rule", () => {
    expect(
      buildEvalExecutionMetadata({
        type: "JOB",
        jobExecutionId: "job-1",
        jobConfigurationId: "evaluator-1",
        evaluatorId: "evaluator-1",
        evaluatorVersionId: "version-2",
        targetTraceId: null,
        targetObservationId: null,
        targetDatasetItemId: null,
      }),
    ).toEqual({
      job_execution_id: "job-1",
      job_configuration_id: "evaluator-1",
      evaluator_id: "evaluator-1",
      evaluator_version_id: "version-2",
    });
  });
});
