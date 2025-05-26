import { Observation } from "@langfuse/shared/src/server"; // Assuming this is the correct import for the domain type
import { logger } from "@langfuse/shared/src/server";

// Helper to safely stringify JSON, returning null or a default on error
function safeJsonStringify(value: any, defaultValue: string | null = null): string | null {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  try {
    // Special handling for empty objects that might represent ClickHouse Maps
    // if (typeof value === 'object' && Object.keys(value).length === 0) {
    //   return '{}'; // Or specific string if GreptimeDB expects something else for empty JSON maps
    // }
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
  const parsedDate = new Date(date);
  if (!isNaN(parsedDate.getTime())) return parsedDate.getTime();
  return null;
}

// This function adapts the Langfuse Observation domain model to the GreptimeDB schema.
// It's based on the GreptimeDB DDL and typical fields in the Observation domain object.
export function convertObservationDomainToGreptimeDBInsert(obs: Observation): Record<string, any> {
  const result: Record<string, any> = {
    id: obs.id,
    trace_id: obs.traceId ?? null, // TAG
    project_id: obs.projectId, // TAG
    type: obs.type, // TAG
    parent_observation_id: obs.parentObservationId ?? null, // TAG
    start_time: dateToMilliseconds(obs.startTime), // TIME INDEX
    end_time: dateToMilliseconds(obs.endTime),
    name: obs.name ?? null,
    metadata: obs.metadata ? safeJsonStringify(obs.metadata) : null,
    level: obs.level ?? null, // TAG
    status_message: obs.statusMessage ?? null,
    version: obs.version ?? null,
    input: obs.input !== undefined ? safeJsonStringify(obs.input) : null,
    output: obs.output !== undefined ? safeJsonStringify(obs.output) : null,
    provided_model_name: obs.model ?? null, // TAG; domain 'model' maps to 'provided_model_name'
    internal_model_id: obs.internalModel ?? null, // TAG; domain 'internalModel'
    model_parameters: obs.modelParameters ? safeJsonStringify(obs.modelParameters) : null,
    
    // Usage and Cost:
    // The ClickHouse schema has `usage`, `calculatedUsage`, `cost`, `calculatedCost`.
    // GreptimeDB has `usage_details`, `provided_usage_details`, `cost_details`, `provided_cost_details`, `total_cost`.
    // Domain object 'usage' seems to map to 'usage_details'.
    // Domain object 'calculatedUsage' seems to map to 'provided_usage_details'.
    // Domain object 'cost' seems to map to 'total_cost'.
    // Domain object 'calculatedCost' seems to map to 'provided_cost_details'.
    // The `cost_details` field in GreptimeDB might be a new field or a misunderstanding of the mapping.
    // For now, assuming GreptimeDB `cost_details` is also from domain's `usage` (if it contains cost info) or needs clarification.
    // Sticking to direct mappings where clear:
    usage_details: obs.usage ? safeJsonStringify(obs.usage) : null,
    provided_usage_details: obs.calculatedUsage ? safeJsonStringify(obs.calculatedUsage) : null, // Mapping calculatedUsage to provided_usage_details
    
    // GreptimeDB's `provided_cost_details` seems to map from domain's `calculatedCost`.
    // The `cost_details` in GreptimeDB schema is less clear. It could be from `obs.usage` if it includes costs, or a separate field.
    // For now, let's assume `provided_cost_details` is the primary one from `obs.calculatedCost`.
    // If `obs.usage` also contains cost information that should go into `cost_details`, that needs to be added.
    provided_cost_details: obs.calculatedCost ? safeJsonStringify({ value: obs.calculatedCost }) : null, // Wrapping in an object as CH schema had Map for cost details.
    // cost_details: obs.usage ? safeJsonStringify(extractCostFromUsage(obs.usage)) : null, // Example if cost info is in usage
    
    total_cost: typeof obs.cost === 'number' ? obs.cost : null, // Domain 'cost' maps to 'total_cost'

    completion_start_time: dateToMilliseconds(obs.completionStartTime),
    prompt_id: obs.promptId ?? null, // TAG
    prompt_name: obs.promptName ?? null,
    prompt_version: typeof obs.promptVersion === 'number' ? obs.promptVersion : null, // Assuming GreptimeDB UInt16 can take null if not provided.
    
    // created_at and updated_at usually rely on DB defaults (DEFAULT now())
    // If domain object has these and they should override DB, uncomment:
    // created_at: dateToMilliseconds(obs.createdAt),
    // updated_at: dateToMilliseconds(obs.updatedAt),
  };

  // Clean up any null values if GreptimeDB prefers fields to be absent vs. null for some types.
  // For string, boolean, number, timestamp, GreptimeDB generally accepts nulls.
  // For JSON string fields, null is fine.
  return result;
}
