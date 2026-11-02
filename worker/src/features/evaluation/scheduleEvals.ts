import { logger, traceException } from "@langfuse/shared/src/server";
import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";
import { env } from "../../env";
import { createObservationEvalSchedulerDeps } from "./observationEval/createSchedulerDeps";
import {
  isObservationAllowedForQueuedObservationEvals,
  scheduleObservationEvals,
} from "./observationEval/scheduleObservationEvals";
import type { ObservationForEval } from "./observationEval/types";
import type { EvalRules } from "./fetchEvalRules";
import { scheduleTraceTranscriptEvals } from "./traceTranscriptEval/scheduleTraceTranscriptEvals";
import { prepareTraceBatchRules } from "../traceBatching/traceBatchRules";
import {
  recordTraceActivity,
  type TraceSpanActivity,
} from "../traceBatching/traceRuleRecording";

/** Create once per batch; prepare trace rules once and flush collected activity together. */
export function createEvalSchedulerDeps(projectId: string, rules: EvalRules) {
  // This buffer belongs to one ingestion invocation, which awaits its flush before returning.
  const traceActivity: TraceSpanActivity[] = [];
  const traceTranscriptRules =
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED === "true" &&
    isTopicsProjectEnabled(projectId)
      ? prepareTraceBatchRules(projectId, rules.traceTranscriptRules).catch(
          (error) => {
            traceException(error);
            logger.warn("Failed to prepare trace transcript rules", {
              projectId,
              error,
            });
            return [];
          },
        )
      : Promise.resolve([]);

  return {
    ...createObservationEvalSchedulerDeps(),
    traceTranscriptRules,
    collectTraceActivity: (activity: TraceSpanActivity): void => {
      traceActivity.push(activity);
    },
    flushTraceActivity: async (): Promise<void> => {
      if (traceActivity.length === 0) return;
      await recordTraceActivity(projectId, traceActivity);
      traceActivity.length = 0;
    },
  };
}

export type EvalSchedulerDeps = ReturnType<typeof createEvalSchedulerDeps>;

/** Schedule both evaluation targets without one target's failure suppressing the other. */
export async function scheduleEvals({
  observation,
  traceActivity,
  rules,
  schedulerDeps,
}: {
  observation: ObservationForEval;
  traceActivity: TraceSpanActivity;
  rules: EvalRules;
  schedulerDeps: EvalSchedulerDeps;
}): Promise<void> {
  const results = await Promise.allSettled([
    scheduleObservationEvals({
      observation,
      configs: isObservationAllowedForQueuedObservationEvals(observation)
        ? rules.observationRules
        : [],
      schedulerDeps,
    }),
    scheduleTraceTranscriptEvals({ observation, traceActivity, schedulerDeps }),
  ]);
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, "Failed to schedule evaluations");
  }
}
