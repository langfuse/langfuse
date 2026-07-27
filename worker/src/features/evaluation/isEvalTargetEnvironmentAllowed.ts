import { LangfuseInternalTraceEnvironment } from "@langfuse/shared/src/server";

/**
 * Final, fail-closed loop safeguard at eval EXECUTION time.
 *
 * Internal Langfuse executions (LLM-as-a-judge, code evals, natural-language
 * filters) write their telemetry into reserved `langfuse-*` environments. An
 * eval whose TARGET lives in such an environment is an eval-of-an-eval: it
 * would spawn another internal execution, whose telemetry could be evaluated
 * again — an infinite loop with per-cycle LLM cost.
 *
 * Scheduling-time guards exist per entry point (trace-upsert in
 * createEvalJobs, the OTel queue's observation-eval guard), but every new
 * ingestion mode or scheduling path must remember to add one. This check runs
 * where all paths converge — the eval executors, right before any LLM/code
 * execution — so a missing upstream guard degrades to wasted queue churn, not
 * recursion.
 *
 * Single sanctioned exception: prompt-experiment outputs. Users attach
 * evaluators to dataset runs, so their run items (environment
 * `langfuse-prompt-experiment`) are legitimate eval targets. This cannot
 * re-open a loop: experiments are only ever created by explicit user actions
 * (never by ingestion), and the evals they trigger execute in
 * `langfuse-llm-as-a-judge`, which stays blocked here.
 */
export function isEvalTargetEnvironmentAllowed(
  environment: string | null | undefined,
): boolean {
  if (!environment?.startsWith("langfuse")) {
    return true;
  }

  return environment === LangfuseInternalTraceEnvironment.PromptExperiments;
}
