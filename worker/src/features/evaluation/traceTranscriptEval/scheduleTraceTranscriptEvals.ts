import type { ObservationForEval } from "../observationEval/types";
import { isInternalEvalEnvironment } from "@langfuse/shared/src/server";
import type { EvalSchedulerDeps } from "../scheduleEvals";
import { getMatchingTraceBatchRuleIds } from "../../traceBatching/traceBatchRules";
import type { TraceSpanActivity } from "../../traceBatching/traceRuleRecording";
import { isTraceBatchSampled } from "../../traceBatching/traceBatchSampling";
import { env } from "../../../env";

// Load-test marker only; no evaluator is associated with this ID.
const EXPERIMENT_RULE_ID = "__trace_batch_experiment__";

export function getTraceBatchExperimentRuleIds(traceId: string): string[] {
  return isTraceBatchSampled(traceId, env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE)
    ? [EXPERIMENT_RULE_ID]
    : [];
}

/**
 * Match transcript rules for one span. Returns undefined when the span is not
 * recorded. An empty array still extends bounds. The caller buffers the result
 * only after the events write succeeds.
 */
export async function scheduleTraceTranscriptEvals({
  observation,
  traceActivity,
  schedulerDeps,
}: {
  observation: ObservationForEval;
  /** Absent when the batch does not write the events table directly. */
  traceActivity?: Omit<TraceSpanActivity, "ruleIds" | "serializedEventBytes">;
  schedulerDeps: EvalSchedulerDeps;
}): Promise<readonly string[] | undefined> {
  // Only directly written events reach the trace-batch worker; Topics also
  // excludes internal traces, including prompt experiments.
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
