import type { ObservationForEval } from "../observationEval/types";
import { isInternalEvalEnvironment } from "@langfuse/shared/src/server";
import type { EvalSchedulerDeps } from "../scheduleEvals";
import { getMatchingTraceBatchRuleIds } from "../../traceBatching/traceBatchRules";
import type { TraceSpanActivity } from "../../traceBatching/traceRuleRecording";
import { isTraceBatchSampled } from "../../traceBatching/traceBatchSampling";
import { env } from "../../../env";

// Load-test marker only; no evaluator is associated with this ID.
const EXPERIMENT_RULE_ID = "__trace_batch_experiment__";

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
  const ruleIds = getMatchingTraceBatchRuleIds(observation, rules);
  if (
    ruleIds.length === 0 &&
    isTraceBatchSampled(
      observation.trace_id,
      env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE,
    )
  ) {
    ruleIds.push(EXPERIMENT_RULE_ID);
  }
  return ruleIds;
}
