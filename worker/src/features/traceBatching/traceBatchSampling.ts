import {
  getTraceEvalsProcessingSampling,
  isTraceEvalsProjectEnabled,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";
import {
  getTopicsProcessingSampling,
  isTopicsEnabled,
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

/**
 * A trace is admitted when it passes its Topics rule's sampling, its trace
 * evals rule's sampling, or the experiment's sampling. All use the same
 * deterministic trace-ID value, so the admitted share is the largest rate.
 */
export async function resolveTraceBatchSamplingRate(
  projectId: string,
): Promise<number> {
  if (!isTraceBatchPipelineEnabled()) return 0;

  const [topicsRate, traceEvalsRate] = await Promise.all([
    resolveTopicsRate(projectId),
    resolveTraceEvalsRate(projectId),
  ]);
  const experimentRate = isTraceDispatchEnabled()
    ? env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE
    : 0;
  return Math.max(topicsRate, traceEvalsRate, experimentRate);
}

async function resolveTopicsRate(projectId: string): Promise<number> {
  try {
    return await getTopicsProcessingSampling(projectId);
  } catch (error) {
    // Preserve Topics intake during an outage; consumers still check project models.
    recordIncrement("langfuse.trace_batch.topics_gate_failures", 1);
    logger.warn("Failed to read Topics processing state, using allowlist", {
      projectId,
      error,
    });
    return isTopicsProjectEnabled(projectId) ? 1 : 0;
  }
}

/** Trace evals record only through trace dispatch; legacy Topics batching never admits them. */
async function resolveTraceEvalsRate(projectId: string): Promise<number> {
  if (!isTraceDispatchEnabled()) return 0;
  try {
    return await getTraceEvalsProcessingSampling(projectId);
  } catch (error) {
    // Preserve trace evals intake during an outage; rules are still matched per trace.
    recordIncrement("langfuse.trace_batch.trace_evals_gate_failures", 1);
    logger.warn(
      "Failed to read trace evals processing state, using allowlist",
      {
        projectId,
        error,
      },
    );
    return isTraceEvalsProjectEnabled(projectId) ? 1 : 0;
  }
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
