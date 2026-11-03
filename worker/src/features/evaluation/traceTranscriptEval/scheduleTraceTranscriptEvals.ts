import type { ObservationForEval } from "../observationEval/types";
import { isInternalEvalEnvironment } from "@langfuse/shared/src/server";
import type { EvalSchedulerDeps } from "../scheduleEvals";
import { getMatchingTraceBatchRuleIds } from "../../traceBatching/traceBatchRules";
import type { TraceSpanActivity } from "../../traceBatching/traceRuleRecording";
import { isTraceBatchSampled } from "../../traceBatching/traceBatchSampling";
import { env } from "../../../env";

// Load-test marker only; no evaluator is associated with this ID.
const EXPERIMENT_RULE_ID = "__trace_batch_experiment__";

/** Collect trace selections for readiness; transcript execution happens after dispatch. */
export async function scheduleTraceTranscriptEvals({
  observation,
  traceActivity,
  schedulerDeps,
}: {
  observation: ObservationForEval;
  /** Absent when the batch does not write the events table directly. */
  traceActivity?: Omit<TraceSpanActivity, "ruleIds">;
  schedulerDeps: EvalSchedulerDeps;
}): Promise<void> {
  // Only directly written events reach the trace-batch worker; Topics also
  // excludes internal traces, including prompt experiments.
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
  // Non-matching observations still extend bounds and existing readiness.
  schedulerDeps.collectTraceActivity({
    ...traceActivity,
    ruleIds,
  });
}
