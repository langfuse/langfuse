import { logger, recordIncrement } from "@langfuse/shared/src/server";
import {
  getTopicsProcessingSampling,
  isTopicsProjectEnabled,
} from "@langfuse/shared/topics/server";
import { env } from "../../env";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../evaluation/deterministicSampling";
import { isEventsDispatchEnabled } from "../eventsDispatch/config";

/**
 * A trace is admitted when it passes its Topics rule's sampling or the
 * experiment's sampling. Both use the same deterministic trace-ID value, so
 * the admitted share is the larger rate.
 */
export async function resolveTraceBatchSamplingRate(
  projectId: string,
): Promise<number> {
  if (!isEventsDispatchEnabled()) return 0;

  let topicsRate: number;
  try {
    topicsRate = await getTopicsProcessingSampling(projectId);
  } catch (error) {
    // Preserve Topics intake during an outage; consumers still check project models.
    recordIncrement("langfuse.trace_dispatch.topics_gate_failures", 1);
    logger.warn("Failed to read Topics processing state, using allowlist", {
      projectId,
      error,
    });
    topicsRate = isTopicsProjectEnabled(projectId) ? 1 : 0;
  }
  return Math.max(
    topicsRate,
    env.LANGFUSE_EVENTS_DISPATCH_SAMPLING_RATE_EXPERIMENTAL,
  );
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
