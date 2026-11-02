import { logger, traceException } from "@langfuse/shared/src/server";
import { isTopicsProjectEnabled } from "@langfuse/shared/topics/server";
import { createObservationEvalSchedulerDeps } from "./observationEval/createSchedulerDeps";
import {
  isObservationAllowedForQueuedObservationEvals,
  scheduleObservationEvals,
} from "./observationEval/scheduleObservationEvals";
import type { ObservationForEval } from "./observationEval/types";
import type { EvalRules } from "./fetchEvalRules";
import { scheduleTraceTranscriptEvals } from "./traceTranscriptEval/scheduleTraceTranscriptEvals";
import { prepareTraceBatchRules } from "../traceBatching/traceBatchRules";
import { recordTraceRuleMatches } from "../traceBatching/traceRuleRecording";

type TraceActivity = {
  traceId: string;
  startTimeISO: string;
  ruleIds: string[];
};

/** Create once per batch; prepare trace rules once and flush collected activity together. */
export function createEvalSchedulerDeps(projectId: string, rules: EvalRules) {
  const traceEvents: TraceActivity[] = [];
  const traceTranscriptRules = isTopicsProjectEnabled(projectId)
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
    recordTraceActivity: (event: TraceActivity): void => {
      traceEvents.push(event);
    },
    flushTraceActivity: async (): Promise<void> => {
      if (traceEvents.length === 0) return;
      await recordTraceRuleMatches(projectId, traceEvents);
      traceEvents.length = 0;
    },
  };
}

export type EvalSchedulerDeps = ReturnType<typeof createEvalSchedulerDeps>;

/** Schedule both evaluation targets without one target's failure suppressing the other. */
export async function scheduleEvals({
  observation,
  startTimeISO,
  rules,
  schedulerDeps,
}: {
  observation: ObservationForEval;
  startTimeISO: string;
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
    scheduleTraceTranscriptEvals({ observation, startTimeISO, schedulerDeps }),
  ]);
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, "Failed to schedule evaluations");
  }
}
