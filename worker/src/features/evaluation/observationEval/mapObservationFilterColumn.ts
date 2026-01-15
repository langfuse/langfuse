import { type ObservationEvent } from "./types";

interface MapObservationColumnParams {
  observation: ObservationEvent;
  columnId: string;
}

/**
 * Maps filter column IDs to observation field values.
 * Used by InMemoryFilterService.evaluateFilter() to evaluate observation-based eval filters.
 *
 * Supports both observation-level fields and trace-level fields from OTEL attributes.
 */
export function mapObservationFilterColumn(
  params: MapObservationColumnParams,
): unknown {
  const { observation, columnId } = params;

  const mapping: Record<string, unknown> = {
    // Observation-level fields
    type: observation.type,
    name: observation.name,
    model: observation.modelName,
    level: observation.level,
    metadata: observation.metadata,
    // Trace-level fields (from OTEL span attributes)
    trace_name: observation.traceName, // In OTEL, trace name comes from span name
    user_id: observation.userId,
    session_id: observation.sessionId,
    tags: observation.tags,
    release: observation.release,
  };

  return mapping[columnId];
}
