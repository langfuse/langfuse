import { Trace } from "@langfuse/shared/src/server"; // Assuming this is the correct import for the domain type
import { logger } from "@langfuse/shared/src/server";

// Helper to safely stringify JSON, returning null or a default on error
function safeJsonStringify(value: any, defaultValue: string | null = null): string | null {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    logger.error("Error stringifying JSON value", error, value);
    return defaultValue;
  }
}

// Helper to convert Date objects to milliseconds or keep as null/undefined
function dateToMilliseconds(date: Date | string | undefined | null): number | null {
  if (!date) return null;
  if (date instanceof Date) return date.getTime();
  // Attempt to parse if it's a string, though domain objects should have Date instances
  const parsedDate = new Date(date);
  if (!isNaN(parsedDate.getTime())) return parsedDate.getTime();
  return null;
}

export function convertTraceDomainToGreptimeDBInsert(trace: Trace): Record<string, any> {
  return {
    id: trace.id,
    timestamp: dateToMilliseconds(trace.timestamp), // TIME INDEX
    name: trace.name ?? null, // TAG
    user_id: trace.userId ?? null, // TAG
    metadata: trace.metadata ? safeJsonStringify(trace.metadata) : null,
    release: trace.release ?? null, // TAG
    version: trace.version ?? null, // TAG
    project_id: trace.projectId, // TAG
    public: typeof trace.public === 'boolean' ? trace.public : null,
    bookmarked: typeof trace.bookmarked === 'boolean' ? trace.bookmarked : null,
    tags: trace.tags ? safeJsonStringify(trace.tags) : null, // Assumes trace.tags is an array
    input: trace.input !== undefined ? safeJsonStringify(trace.input) : null,
    output: trace.output !== undefined ? safeJsonStringify(trace.output) : null,
    session_id: trace.sessionId ?? null,
    // GreptimeDB DDL has DEFAULT now() for these, so only send if available from domain
    // and not relying on DB default. If domain object always has them, then include.
    // Assuming createdAt and updatedAt might not be part of the core Trace domain object for insertion
    // or should rely on DB defaults if not explicitly set by application logic.
    // If they are guaranteed and should override DB default, uncomment:
    // created_at: dateToMilliseconds(trace.createdAt),
    // updated_at: dateToMilliseconds(trace.updatedAt),
  };
}
