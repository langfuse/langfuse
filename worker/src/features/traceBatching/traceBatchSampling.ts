import { logger, recordIncrement } from "@langfuse/shared/src/server";
import {
  isTopicsProcessingActive,
  isTopicsProjectEnabled,
} from "@langfuse/shared/topics/server";
import { env } from "../../env";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../evaluation/deterministicSampling";

/** Both trace writers admit active Topics projects or the same sampled trace IDs. */
export async function resolveTraceBatchSamplingRate(
  projectId: string,
): Promise<number> {
  if (
    !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ||
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED !== "true"
  )
    return 0;

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
  return topicsProject ? 1 : env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE;
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
