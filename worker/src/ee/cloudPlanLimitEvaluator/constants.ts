export const cloudPlanLimitEvaluatorDbCronJobName =
  "cloud_plan_limit_evaluator";

export const OBSERVATION_MONTHLY_LIMIT = 50_000;

export enum CloudPlanLimitEvaluatorDbCronJobStates {
  Queued = "queued",
  Processing = "processing",
}
