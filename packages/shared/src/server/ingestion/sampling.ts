import crypto from "node:crypto";
import { logger } from "../logger";
import { env } from "../../env";
import { IngestionEventType } from "./types";

export function isTraceIdInSample(params: {
  projectId: string | null;
  event: IngestionEventType;
}): { isSampled: boolean; isSamplingConfigured: boolean } {
  const { projectId, event } = params;

  const sampledProjects = env.LANGFUSE_INGESTION_PROCESSING_SAMPLED_PROJECTS;

  if (!projectId || !sampledProjects.has(projectId))
    return { isSampled: true, isSamplingConfigured: false };

  const sampleRate = sampledProjects.get(projectId);
  if (sampleRate === undefined)
    return { isSampled: true, isSamplingConfigured: true };

  const traceId = parseTraceId(event);
  if (!traceId) return { isSampled: true, isSamplingConfigured: true };

  return {
    isSampled: isInSample(traceId, sampleRate),
    isSamplingConfigured: true,
  };
}

function isInSample(traceId: string, sampleRate: number) {
  if (sampleRate < 0 || sampleRate > 1) {
    logger.error(`Invalid sample rate ${sampleRate}`);

    // Be conservative and keep the trace ID in sample for invalid configs
    return true;
  }

  if (sampleRate === 0) return false;
  if (sampleRate === 1) return true;

  // Create SHA-256 hash of the input
  const hash = crypto.createHash("sha256").update(traceId).digest("hex");

  // Take first 8 characters and convert to integer
  // Equivalent to 4 bytes, 32 bit integer
  const hashInt = parseInt(hash.substring(0, 8), 16);

  // Convert to a value between 0 and 1 by dividing by largest integer
  const normalizedHash = hashInt / 0xffffffff;

  // Return true if normalized hash is less than sample rate
  return normalizedHash < sampleRate;
}

function parseTraceId(event: IngestionEventType): string | null | undefined {
  if (event.type === "trace-create") return event.body.id;

  return "traceId" in event.body ? event.body.traceId : null;
}
