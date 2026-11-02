import type { ObservationForEval } from "../observationEval/types";
import { isInternalEvalEnvironment } from "@langfuse/shared/src/server";
import type { EvalSchedulerDeps } from "../scheduleEvals";
import { getMatchingTraceBatchRuleIds } from "../../traceBatching/traceBatchRules";
import type { TraceSpanActivity } from "../../traceBatching/traceRuleRecording";

/** Collect trace selections for readiness; transcript execution happens after dispatch. */
export async function scheduleTraceTranscriptEvals({
  observation,
  traceActivity,
  schedulerDeps,
}: {
  observation: ObservationForEval;
  traceActivity: TraceSpanActivity;
  schedulerDeps: EvalSchedulerDeps;
}): Promise<void> {
  // Topics excludes internal traces, including prompt experiments.
  if (isInternalEvalEnvironment(observation.environment)) return;

  const rules = await schedulerDeps.traceTranscriptRules;
  if (rules.length === 0) return;

  // Select rules using filters and trace-ID sampling; recording does not sample again.
  traceActivity.ruleIds = getMatchingTraceBatchRuleIds(observation, rules);
  // Non-matching observations still extend bounds and existing readiness.
  schedulerDeps.collectTraceActivity(traceActivity);
}
