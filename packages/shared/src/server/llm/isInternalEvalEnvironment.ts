export const INTERNAL_EVAL_ENVIRONMENT_PREFIX = "langfuse";

// Public ingestion strips the reserved `langfuse-` prefix from environments
// originating outside Langfuse, including OpenRouter Broadcast callbacks:
// `langfuse-llm-as-a-judge` -> `llm-as-a-judge` and
// `langfuse-topics-internal` -> `topics-internal`.
const PUBLIC_LLM_JUDGE_ENVIRONMENT = "llm-as-a-judge";
const PUBLIC_TOPICS_ENVIRONMENT = "topics-internal";

export const PUBLIC_INTERNAL_EVAL_ENVIRONMENTS = [
  PUBLIC_LLM_JUDGE_ENVIRONMENT,
  PUBLIC_TOPICS_ENVIRONMENT,
] as const;

const PUBLIC_INTERNAL_EVAL_ENVIRONMENT_SET: ReadonlySet<string> = new Set(
  PUBLIC_INTERNAL_EVAL_ENVIRONMENTS,
);

export function isInternalEvalEnvironment(
  environment: string | null | undefined,
): boolean {
  return (
    environment?.startsWith(INTERNAL_EVAL_ENVIRONMENT_PREFIX) === true ||
    (environment != null &&
      PUBLIC_INTERNAL_EVAL_ENVIRONMENT_SET.has(environment))
  );
}
