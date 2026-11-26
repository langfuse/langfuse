import type { ObservationEvalFilterFields } from "@langfuse/shared";
import { isInternalEvalEnvironment } from "@langfuse/shared/src/server";
import type { EvalSchedulerDeps } from "../scheduleEvals";
import { getMatchingTraceDispatchRuleIds } from "../../traceDispatch/traceDispatchRules";
import type { TraceSpanActivity } from "../../traceDispatch/traceRuleRecording";

/**
 * Return selected rule IDs: undefined skips recording; [] still updates bounds.
 * The caller records activity only after the event writer accepts the span.
 */
export async function scheduleTraceTranscriptEvals({
  observation,
  traceActivity,
  schedulerDeps,
}: {
  observation: ObservationEvalFilterFields;
  /** Present only for direct event writes. */
  traceActivity?: Omit<TraceSpanActivity, "ruleIds" | "serializedEventBytes">;
  schedulerDeps: EvalSchedulerDeps;
}): Promise<readonly string[] | undefined> {
  // Internal traces, including prompt experiments, never enter transcript recording.
  if (!traceActivity || isInternalEvalEnvironment(observation.environment))
    return;

  const rules = await schedulerDeps.traceTranscriptRules;

  // Select rules using filters and trace-ID sampling; recording does not sample again.
  // Non-matching observations still extend bounds once the write succeeds.
  return rules.length > 0
    ? getMatchingTraceDispatchRuleIds(observation, rules)
    : [];
}
