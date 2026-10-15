import { LangfuseInternalTraceEnvironment } from "./types";

export const INTERNAL_EVAL_ENVIRONMENT_PREFIX = "langfuse";

// Public ingestion strips the reserved `langfuse-` prefix from environments
// originating outside Langfuse, including OpenRouter Broadcast callbacks.
export const PUBLIC_LLM_JUDGE_ENVIRONMENT = "llm-as-a-judge";

export function isInternalEvalEnvironment(
  environment: string | null | undefined,
): boolean {
  return (
    environment?.startsWith(INTERNAL_EVAL_ENVIRONMENT_PREFIX) === true ||
    environment === PUBLIC_LLM_JUDGE_ENVIRONMENT
  );
}

/**
 * ClickHouse predicate for observations an eval executor accepts as targets:
 * everything outside internal environments, plus prompt-experiment outputs.
 * Must stay in sync with the worker's `isEvalTargetEnvironmentAllowed`, which
 * cancels any job whose target this predicate would exclude.
 */
export function buildEvalTargetEnvironmentCondition(column: string): {
  query: string;
  params: Record<string, string>;
} {
  return {
    query: `((NOT startsWith(${column}, {evalTargetInternalEnvironmentPrefix: String}) AND ${column} != {evalTargetPublicLlmJudgeEnvironment: String}) OR ${column} = {evalTargetPromptExperimentEnvironment: String})`,
    params: {
      evalTargetInternalEnvironmentPrefix: INTERNAL_EVAL_ENVIRONMENT_PREFIX,
      evalTargetPublicLlmJudgeEnvironment: PUBLIC_LLM_JUDGE_ENVIRONMENT,
      evalTargetPromptExperimentEnvironment:
        LangfuseInternalTraceEnvironment.PromptExperiments,
    },
  };
}
