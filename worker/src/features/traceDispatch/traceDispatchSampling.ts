import { logger, recordIncrement } from "@langfuse/shared/src/server";
import {
  getTopicsProcessingSampling,
  isTopicsProjectEnabled,
} from "@langfuse/shared/topics/server";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../evaluation/deterministicSampling";
import { isEventsDispatchEnabled } from "../eventsDispatch/config";

/**
 * A trace is admitted when it passes its project's Topics rule sampling, using
 * the deterministic trace-ID value.
 */
export async function resolveTraceDispatchSamplingRate(
  projectId: string,
): Promise<number> {
  if (!isEventsDispatchEnabled()) return 0;

  try {
    return await getTopicsProcessingSampling(projectId);
  } catch (error) {
    // Preserve Topics intake during an outage; consumers still check project models.
    recordIncrement("langfuse.trace_dispatch.topics_gate_failures", 1);
    logger.warn("Failed to read Topics processing state, using allowlist", {
      projectId,
      error,
    });
    return isTopicsProjectEnabled(projectId) ? 1 : 0;
  }
}

export function isTraceDispatchSampled(
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
