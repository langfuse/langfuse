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
          evaluator_id: params.evaluatorId,
          evaluator_test: "true",
          target_trace_id: params.targetTraceId,
          target_observation_id: params.targetObservationId,
        }
      : {
          job_execution_id: params.jobExecutionId,
          job_configuration_id: params.jobConfigurationId,
          ...(params.evaluationRuleId
            ? { rule_id: params.evaluationRuleId }
            : {}),
          ...(params.assignmentId
            ? { assignment_id: params.assignmentId }
            : {}),
          evaluator_id: params.evaluatorId,
          evaluator_version_id: params.evaluatorVersionId,
          target_trace_id: params.targetTraceId,
          target_observation_id: params.targetObservationId,
          target_dataset_item_id: params.targetDatasetItemId,
        };

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value != null),
  ) as Record<string, string>;
}
