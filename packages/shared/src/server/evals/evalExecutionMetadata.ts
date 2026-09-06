import {
  EvalExecutionMetadataKey,
  type EvalExecutionContext,
} from "../../features/evals/evalExecutionMetadata";

export function buildEvalExecutionData(
  params:
    | {
        type: "TEST";
        evaluatorId?: string | null;
        targetTraceId: string;
        targetObservationId: string;
      }
    | {
        type: "JOB";
        jobExecutionId: string;
        jobConfigurationId: string;
        evaluationRuleId?: string;
        assignmentId?: string;
        evaluatorId?: string;
        evaluatorVersionId?: string;
        targetTraceId: string | null;
        targetObservationId: string | null;
        targetDatasetItemId: string | null;
      },
) {
  // Keep old workers and legacy trace/observation sinks compatible during the
  // v4 rollout. This metadata transport can be removed in v5.
  const executionMetadata =
    params.type === "TEST"
      ? {
          [EvalExecutionMetadataKey.EVALUATOR_ID]: params.evaluatorId,
          [EvalExecutionMetadataKey.EVALUATOR_TEST]: "true",
          [EvalExecutionMetadataKey.TARGET_TRACE_ID]: params.targetTraceId,
          [EvalExecutionMetadataKey.TARGET_OBSERVATION_ID]:
            params.targetObservationId,
        }
      : {
          [EvalExecutionMetadataKey.JOB_EXECUTION_ID]: params.jobExecutionId,
          [EvalExecutionMetadataKey.JOB_CONFIGURATION_ID]:
            params.jobConfigurationId,
          ...(params.evaluationRuleId
            ? {
                [EvalExecutionMetadataKey.EVALUATION_RULE_ID]:
                  params.evaluationRuleId,
              }
            : {}),
          ...(params.assignmentId
            ? {
                [EvalExecutionMetadataKey.EVALUATION_RULE_ASSIGNMENT_ID]:
                  params.assignmentId,
              }
            : {}),
          [EvalExecutionMetadataKey.EVALUATOR_VERSION_ID]:
            params.evaluatorVersionId,
          [EvalExecutionMetadataKey.EVALUATOR_ID]: params.evaluatorId,
          [EvalExecutionMetadataKey.TARGET_TRACE_ID]: params.targetTraceId,
          [EvalExecutionMetadataKey.TARGET_OBSERVATION_ID]:
            params.targetObservationId,
          [EvalExecutionMetadataKey.TARGET_DATASET_ITEM_ID]:
            params.targetDatasetItemId,
        };

  const evaluationContext: EvalExecutionContext =
    params.type === "TEST"
      ? {
          evaluatorId: params.evaluatorId ?? undefined,
          evaluatorExecutionIsTest: true,
        }
      : {
          evaluatorId: params.evaluatorId,
          evaluationRuleId:
            params.evaluationRuleId ?? params.jobConfigurationId,
          evaluatorExecutionIsTest: false,
        };

  return {
    executionMetadata: Object.fromEntries(
      Object.entries(executionMetadata).filter(([, value]) => value != null),
    ) as Record<string, string>,
    evaluationContext,
  };
}
