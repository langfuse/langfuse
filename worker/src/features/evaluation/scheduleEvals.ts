import {
  logger,
  isInternalEvalEnvironment,
  traceException,
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
import {
  getTraceBatchExperimentRuleIds,
  scheduleTraceTranscriptEvals,
} from "./traceTranscriptEval/scheduleTraceTranscriptEvals";
import { prepareTraceBatchRules } from "../traceBatching/traceBatchRules";
import {
  recordTraceActivity,
  type TraceSpanActivity,
} from "../traceBatching/traceRuleRecording";

/** Prepare rules and own the trace-activity buffer for one ingestion batch. */
export function createEvalSchedulerDeps(projectId: string, rules: EvalRules) {
  // The caller flushes this buffer before returning.
  const traceActivity: TraceSpanActivity[] = [];
  const traceTranscriptRules = prepareTraceBatchRules(
    projectId,
    rules.traceTranscriptRules,
  ).catch((error) => {
    // Recording-only failures must not mark ingestion as failed.
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

type SchedulingFailureContext = {
  projectId: string;
  observationId: string;
  fileKey?: string;
};

/**
 * Match transcript rules and schedule observation evals.
 * Return rule IDs for recording after the event write; undefined skips recording.
 */
export async function scheduleEvals({
  parseObservation,
  environment,
  traceActivity,
  rules,
  schedulerDeps,
  buildFailureContext,
}: {
  /** Convert the payload only when an evaluation rule needs it. */
  parseObservation: () => ObservationForEval;
  environment: string;
  /** Present only for sampled direct event writes. */
  traceActivity?: Omit<TraceSpanActivity, "ruleIds" | "serializedEventBytes">;
  rules: EvalRules;
  schedulerDeps: EvalSchedulerDeps;
  /** Read identifiers on failure, without requiring observation conversion. */
  buildFailureContext: () => SchedulingFailureContext;
}): Promise<readonly string[] | undefined> {
  if (isInternalEvalEnvironment(environment)) traceActivity = undefined;
  let matchedRuleIds: readonly string[] | undefined =
    traceActivity && rules.traceTranscriptRules.length === 0
      ? getTraceBatchExperimentRuleIds(traceActivity.traceId)
      : undefined;
  if (
    rules.observationRules.length === 0 &&
    !(traceActivity && rules.traceTranscriptRules.length > 0)
  ) {
    return matchedRuleIds;
  }

  try {
    const observation = parseObservation();
    if (traceActivity && rules.traceTranscriptRules.length > 0) {
      matchedRuleIds = await matchTranscriptRules(
        { observation, traceActivity, schedulerDeps },
        buildFailureContext,
      );
    }
    if (isObservationAllowedForQueuedObservationEvals(observation)) {
      await scheduleObservationEvals({
        observation,
        configs: rules.observationRules,
        schedulerDeps,
      });
    }
  } catch (error) {
    reportSchedulingFailure(error, rules, buildFailureContext());
  }
  return matchedRuleIds;
}

async function matchTranscriptRules(
  params: Parameters<typeof scheduleTraceTranscriptEvals>[0],
  buildFailureContext: () => SchedulingFailureContext,
) {
  try {
    return await scheduleTraceTranscriptEvals(params);
  } catch (error) {
    logger.warn("Failed to match trace transcript rules", {
      error,
      ...buildFailureContext(),
    });
  }
}

function reportSchedulingFailure(
  error: unknown,
  rules: EvalRules,
  context: SchedulingFailureContext,
): void {
  if (rules.observationRules.length > 0) {
    traceException(error);
    logger.error("Failed to schedule observation evals", { error, ...context });
  } else {
    logger.warn("Failed to normalize observation for trace transcript rules", {
      error,
      ...context,
    });
  }
}
