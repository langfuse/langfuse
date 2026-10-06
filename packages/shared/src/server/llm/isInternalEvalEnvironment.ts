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
