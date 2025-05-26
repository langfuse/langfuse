import { Score } from "@langfuse/shared/src/server"; // Assuming this is the correct import for the domain type
import { logger } from "@langfuse/shared/src/server";

// Helper to safely stringify JSON, returning null or a default on error
// Not strictly needed for scores based on the DDL (no direct JSON fields like metadata),
// but good practice if any string fields could potentially be complex objects passed by mistake.
function safeJsonStringify(value: any, defaultValue: string | null = null): string | null {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value === 'string') { // If it's already a string, pass through
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    logger.error("Error stringifying JSON value for score", error, value);
    return defaultValue;
  }
}

// Helper to convert Date objects to milliseconds or keep as null/undefined
function dateToMilliseconds(date: Date | string | undefined | null): number | null {
  if (!date) return null;
  if (date instanceof Date) return date.getTime();
  const parsedDate = new Date(date);
  if (!isNaN(parsedDate.getTime())) return parsedDate.getTime();
  return null;
}

export function convertScoreDomainToGreptimeDBInsert(score: Score): Record<string, any> {
  const result: Record<string, any> = {
    id: score.id,
    timestamp: dateToMilliseconds(score.timestamp), // TIME INDEX
    project_id: score.projectId, // TAG
    trace_id: score.traceId, // TAG
    observation_id: score.observationId ?? null, // TAG
    name: score.name, // TAG
    value: typeof score.value === 'number' ? score.value : null, // GreptimeDB FLOAT64
    source: score.source, // TAG
    comment: score.comment ?? null,
    author_user_id: score.authorUserId ?? null, // TAG
    config_id: score.configId ?? null, // TAG
    data_type: score.dataType, // TAG - Assuming ScoreDataType is an enum or string type
    string_value: score.stringValue ?? null,
    queue_id: score.queueId ?? null, // TAG

    // created_at and updated_at usually rely on DB defaults (DEFAULT now())
    // If domain object has these and they should override DB, uncomment:
    // created_at: dateToMilliseconds(score.createdAt),
    // updated_at: dateToMilliseconds(score.updatedAt),
  };
  
  // Optional: if metadata was part of Score domain and needed to be stored (e.g., in 'comment' or a new 'metadata' field if DDL changes)
  // if (score.metadata) {
  //   result.metadata = safeJsonStringify(score.metadata);
  // }

  return result;
}
