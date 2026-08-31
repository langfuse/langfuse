import { EvalExecutionMetadataKey } from "../../features/evals/evalExecutionMetadata";

export function buildEvalExecutionMetadata(
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
  const metadata =
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
          [EvalExecutionMetadataKey.EVALUATOR_ID]: params.evaluatorId,
          [EvalExecutionMetadataKey.EVALUATOR_VERSION_ID]:
            params.evaluatorVersionId,
          [EvalExecutionMetadataKey.TARGET_TRACE_ID]: params.targetTraceId,
          [EvalExecutionMetadataKey.TARGET_OBSERVATION_ID]:
            params.targetObservationId,
          [EvalExecutionMetadataKey.TARGET_DATASET_ITEM_ID]:
            params.targetDatasetItemId,
        };

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value != null),
  ) as Record<string, string>;
}
