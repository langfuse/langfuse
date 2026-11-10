import type { ObservationForEval } from "../observationEval/types";
import { isInternalEvalEnvironment } from "@langfuse/shared/src/server";
import type { EvalSchedulerDeps } from "../scheduleEvals";
import { getMatchingTraceBatchRuleIds } from "../../traceBatching/traceBatchRules";
import type { TraceSpanActivity } from "../../traceBatching/traceRuleRecording";
import { isTraceBatchSampled } from "../../traceBatching/traceBatchSampling";
import { env } from "../../../env";

// Load-test marker only; no evaluator is associated with this ID.
export const EXPERIMENT_RULE_ID = "__trace_batch_experiment__";

export function getTraceBatchExperimentRuleIds(traceId: string): string[] {
  return isTraceBatchSampled(traceId, env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE)
    ? [EXPERIMENT_RULE_ID]
    : [];
}

/**
 * Return selected rule IDs: undefined skips recording; [] still updates bounds.
 * The caller records activity only after the event writer accepts the span.
 */
export async function scheduleTraceTranscriptEvals({
  observation,
  traceActivity,
  schedulerDeps,
}: {
  observation: ObservationForEval;
  /** Present only for direct event writes. */
  traceActivity?: Omit<TraceSpanActivity, "ruleIds" | "serializedEventBytes">;
  schedulerDeps: EvalSchedulerDeps;
}): Promise<readonly string[] | undefined> {
  // Internal traces, including prompt experiments, never enter transcript recording.
  if (!traceActivity || isInternalEvalEnvironment(observation.environment))
    return;

  const rules = await schedulerDeps.traceTranscriptRules;

  // Select rules using filters and trace-ID sampling; recording does not sample again.
  const ruleIds =
    rules.length > 0 ? getMatchingTraceBatchRuleIds(observation, rules) : [];
  // Non-matching observations still extend bounds once the write succeeds.
  return ruleIds.length > 0
    ? ruleIds
    : getTraceBatchExperimentRuleIds(observation.trace_id);
}
