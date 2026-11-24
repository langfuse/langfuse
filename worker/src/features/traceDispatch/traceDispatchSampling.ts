import {
  getTraceEvalsProcessingSampling,
  isTraceEvalsProjectEnabled,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { getTopicsProcessingSampling } from "@langfuse/shared/topics/server";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../evaluation/deterministicSampling";
import { isEventsDispatchEnabled } from "../eventsDispatch/config";

/**
 * A trace is admitted when it passes its project's Topics rule sampling or its
 * trace evals rule sampling. Both use the deterministic trace-ID value, so the
 * admitted share is the larger rate.
 */
export async function resolveTraceDispatchSamplingRate(
  projectId: string,
): Promise<number> {
  if (!isEventsDispatchEnabled()) return 0;

  const [topicsRate, traceEvalsRate] = await Promise.all([
    resolveTopicsRate(projectId),
    resolveTraceEvalsRate(projectId),
  ]);
  return Math.max(topicsRate, traceEvalsRate);
}

async function resolveTopicsRate(projectId: string): Promise<number> {
  try {
    return await getTopicsProcessingSampling(projectId);
  } catch (error) {
    // Fail closed: admitting on error would dispatch every project's traces.
    recordIncrement("langfuse.trace_dispatch.topics_gate_failures", 1);
    logger.warn("Failed to read Topics processing state, skipping dispatch", {
      projectId,
      error,
    });
    return 0;
  }
}

async function resolveTraceEvalsRate(projectId: string): Promise<number> {
  try {
    return await getTraceEvalsProcessingSampling(projectId);
  } catch (error) {
    // Preserve trace evals intake during an outage; rules are still matched per trace.
    recordIncrement("langfuse.trace_dispatch.trace_evals_gate_failures", 1);
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
