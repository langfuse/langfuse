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

export type EvalExecutionContext = {
  evaluatorId?: string;
  evaluationRuleId?: string;
  evaluatorExecutionIsTest: boolean;
};
