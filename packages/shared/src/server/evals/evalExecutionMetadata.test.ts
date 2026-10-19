import { describe, expect, it } from "vitest";
import { buildEvalExecutionData } from "./evalExecutionMetadata";

describe("buildEvalExecutionData", () => {
  it("identifies an evaluator test", () => {
    expect(
      buildEvalExecutionData({
        type: "TEST",
        evaluatorId: "evaluator-1",
        targetTraceId: "trace-1",
        targetObservationId: "observation-1",
      }),
    ).toEqual({
      executionMetadata: {
        evaluator_id: "evaluator-1",
        evaluator_test: "true",
        target_trace_id: "trace-1",
        target_observation_id: "observation-1",
      },
      evaluationContext: {
        evaluatorId: "evaluator-1",
        evaluatorExecutionIsTest: true,
      },
    });
  });

  it("identifies a rule-driven evaluator execution", () => {
    expect(
      buildEvalExecutionData({
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
      executionMetadata: {
        job_execution_id: "job-1",
        job_configuration_id: "rule-1",
        evaluation_rule_id: "rule-1",
        evaluation_rule_assignment_id: "assignment-1",
        evaluator_version_id: "version-2",
        evaluator_id: "evaluator-1",
        target_trace_id: "trace-1",
        target_observation_id: "observation-1",
      },
      evaluationContext: {
        evaluatorId: "evaluator-1",
        evaluationRuleId: "rule-1",
        evaluatorExecutionIsTest: false,
      },
    });
  });

  it("identifies a manual v2 evaluator execution without a rule", () => {
    expect(
      buildEvalExecutionData({
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
      executionMetadata: {
        job_execution_id: "job-1",
        job_configuration_id: "evaluator-1",
        evaluator_version_id: "version-2",
        evaluator_id: "evaluator-1",
      },
      evaluationContext: {
        evaluatorId: "evaluator-1",
        evaluationRuleId: "evaluator-1",
        evaluatorExecutionIsTest: false,
      },
    });
  });
});
