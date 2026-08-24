export const EvalExecutionMetadataKey = {
  EVALUATOR_ID: "evaluator_id",
  EVALUATOR_VERSION_ID: "evaluator_version_id",
  EVALUATOR_TEST: "evaluator_test",
  EVALUATION_RULE_ID: "evaluation_rule_id",
  EVALUATION_RULE_ASSIGNMENT_ID: "evaluation_rule_assignment_id",
  JOB_EXECUTION_ID: "job_execution_id",
  JOB_CONFIGURATION_ID: "job_configuration_id",
  TARGET_TRACE_ID: "target_trace_id",
  TARGET_OBSERVATION_ID: "target_observation_id",
  TARGET_DATASET_ITEM_ID: "target_dataset_item_id",
} as const;

export type EvalExecutionMetadataKey =
  (typeof EvalExecutionMetadataKey)[keyof typeof EvalExecutionMetadataKey];

export function getEvalExecutionMetadata(metadata: Record<string, unknown>) {
  const evaluatorId = metadata[EvalExecutionMetadataKey.EVALUATOR_ID];
  const evaluationRuleId =
    metadata[EvalExecutionMetadataKey.EVALUATION_RULE_ID];
  const legacyRuleId = metadata[EvalExecutionMetadataKey.JOB_CONFIGURATION_ID];
  const evaluatorTest = metadata[EvalExecutionMetadataKey.EVALUATOR_TEST];

  return {
    evaluatorId: typeof evaluatorId === "string" ? evaluatorId : "",
    ruleId:
      typeof evaluationRuleId === "string" && evaluationRuleId.length > 0
        ? evaluationRuleId
        : typeof legacyRuleId === "string"
          ? legacyRuleId
          : "",
    evaluatorExecutionIsTest:
      evaluatorTest === true || evaluatorTest === "true",
  };
}
