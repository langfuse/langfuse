import {
  logger,
  recordDistribution,
  recordIncrement,
} from "@langfuse/shared/src/server";
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
  const traceTranscriptRules = prepareTraceBatchRules(
    projectId,
    rules.traceTranscriptRules,
  ).catch((error) => {
    // Recording-only failures must not mark ingestion as failed.
    // traceException(error);
    logger.warn("Failed to prepare trace transcript rules", {
      projectId,
      error,
    });
    return [];
  });

  return {
    ...createObservationEvalSchedulerDeps(),
    traceTranscriptRules,
    collectTraceActivity: (activity: TraceSpanActivity): void => {
      traceActivity.push(activity);
    },
    flushTraceActivity: async (): Promise<void> => {
      if (traceActivity.length === 0) return;
      const startedAt = performance.now();
      let outcome = "success";
      try {
        await recordTraceActivity(projectId, traceActivity);
        traceActivity.length = 0;
      } catch (error) {
        outcome = "error";
        logger.warn("Failed to record trace rule selections", {
          projectId,
          error,
        });
      } finally {
        recordIncrement("langfuse.trace_dispatch.recording_batches", 1, {
          outcome,
        });
        recordDistribution(
          "langfuse.trace_dispatch.recording_duration_ms",
          performance.now() - startedAt,
          { outcome, unit: "milliseconds" },
        );
      }
    },
  };
}

export type EvalSchedulerDeps = ReturnType<typeof createEvalSchedulerDeps>;

/**
 * Match transcript rules, then schedule observation evals.
 * Returns the selected rule ids. Undefined means this span is not recorded.
 * Does not buffer transcript activity.
 */
export async function scheduleEvals({
  observation,
  traceActivity,
  rules,
  schedulerDeps,
}: {
  observation: ObservationForEval;
  /** Omitted when the batch skips direct event writes; nothing is recorded then. */
  traceActivity?: Omit<TraceSpanActivity, "ruleIds" | "serializedEventBytes">;
  rules: EvalRules;
  schedulerDeps: EvalSchedulerDeps;
}): Promise<readonly string[] | undefined> {
  const matchedRuleIds = await scheduleTraceTranscriptEvals({
    observation,
    traceActivity,
    schedulerDeps,
  });
  await scheduleObservationEvals({
    observation,
    configs: isObservationAllowedForQueuedObservationEvals(observation)
      ? rules.observationRules
      : [],
    schedulerDeps,
  });
  return matchedRuleIds;
}
