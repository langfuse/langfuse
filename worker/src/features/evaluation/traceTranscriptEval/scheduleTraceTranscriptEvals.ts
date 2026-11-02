import type { ObservationForEval } from "../observationEval/types";
import { isInternalEvalEnvironment } from "@langfuse/shared/src/server";
import type { EvalSchedulerDeps } from "../scheduleEvals";
import { getMatchingTraceBatchRuleIds } from "../../traceBatching/traceBatchRules";

/** Collect trace selections for readiness; transcript execution happens after dispatch. */
export async function scheduleTraceTranscriptEvals({
  observation,
  startTimeISO,
  schedulerDeps,
}: {
  observation: ObservationForEval;
  startTimeISO: string;
  schedulerDeps: EvalSchedulerDeps;
}): Promise<void> {
  // Topics excludes internal traces, including prompt experiments.
  if (isInternalEvalEnvironment(observation.environment)) return;

  const rules = await schedulerDeps.traceTranscriptRules;
  if (rules.length === 0) return;

  // Select rules using filters and trace-ID sampling; recording does not sample again.
  const ruleIds = getMatchingTraceBatchRuleIds(observation, rules);
  // Non-matching observations still extend bounds and existing readiness.
  schedulerDeps.collectTraceActivity({
    traceId: observation.trace_id,
    spanStartTimeISO: startTimeISO,
    ruleIds,
  });
}
