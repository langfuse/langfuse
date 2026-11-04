import { logger, recordIncrement } from "@langfuse/shared/src/server";
import {
  isTopicsEnabled,
  isTopicsProcessingActive,
  isTopicsProjectEnabled,
} from "@langfuse/shared/topics/server";
import { env } from "../../env";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../evaluation/deterministicSampling";

export function isTraceDispatchEnabled(): boolean {
  return (
    Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) &&
    env.LANGFUSE_TRACE_DISPATCH_ENABLED === "true"
  );
}

export function isLegacyTopicsBatchingEnabled(): boolean {
  return (
    Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) &&
    !isTraceDispatchEnabled() &&
    isTopicsEnabled()
  );
}

export function isTraceBatchPipelineEnabled(): boolean {
  return isTraceDispatchEnabled() || isLegacyTopicsBatchingEnabled();
}

/** Experiments use a trace-ID sample; legacy Topics admits only active projects. */
export async function resolveTraceBatchSamplingRate(
  projectId: string,
): Promise<number> {
  if (isTraceDispatchEnabled())
    return env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE;
  if (!isLegacyTopicsBatchingEnabled()) return 0;

  let topicsProject: boolean;
  try {
    topicsProject = await isTopicsProcessingActive(projectId);
  } catch (error) {
    // Preserve Topics intake during an outage; consumers still check project models.
    recordIncrement("langfuse.trace_batch.topics_gate_failures", 1);
    logger.warn("Failed to read Topics processing state, using allowlist", {
      projectId,
      error,
    });
    topicsProject = isTopicsProjectEnabled(projectId);
  }
  return topicsProject ? 1 : 0;
}

export function isTraceBatchSampled(
  traceId: string,
  samplingRate: number,
): boolean {
  if (samplingRate <= 0) return false;
  if (samplingRate >= 1) return true;
  return shouldSampleEvaluation({
    samplingValue: getDeterministicSamplingValue(traceId),
    samplingRate,
  });
}
