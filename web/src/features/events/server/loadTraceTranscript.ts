import {
  assembleTranscript,
  getObservationsForTraceFromEventsTable,
  MAX_OBSERVATIONS_PER_TRACE,
  orderObservations,
  type Transcript,
} from "@langfuse/shared/src/server";

/** Generations and tools whose I/O one transcript reads at most. */
const MAX_TRANSCRIPT_OBSERVATIONS = 1_000;

const TRANSCRIPT_OBSERVATION_TYPES = new Set(["GENERATION", "TOOL"]);

/**
 * Load a trace's observations from the events table, walk them in trace tree
 * order, and assemble the transcript of its generations and tools.
 */
export async function loadTraceTranscript(trace: {
  projectId: string;
  traceId: string;
  /** Trace timestamp; observations from one hour before it onwards are read. */
  timestamp: Date;
}): Promise<{
  transcript: Transcript | null;
  /** The trace has more observations than the transcript could read. */
  cutoff: boolean;
}> {
  // The structure of every observation orders the walk; only generations and
  // tools carry I/O, which is what the transcript reads.
  const [structure, content] = await Promise.all([
    getObservationsForTraceFromEventsTable(trace),
    getObservationsForTraceFromEventsTable({
      ...trace,
      selectIOAndMetadata: true,
      types: ["GENERATION", "TOOL"],
      limit: MAX_TRANSCRIPT_OBSERVATIONS,
    }),
  ]);
  const contentById = new Map(content.observations.map((o) => [o.id, o]));
  // Generations and tools past the content cap have no I/O to show; leaving
  // them out beats rendering them as empty turns. `cutoff` tells the caller.
  const observations = structure.observations.flatMap((o) => {
    const withContent = contentById.get(o.id);
    if (withContent) return [withContent];
    return TRANSCRIPT_OBSERVATION_TYPES.has(o.type) ? [] : [o];
  });
  return {
    transcript: assembleTranscript(orderObservations(observations)),
    cutoff:
      structure.totalCount > MAX_OBSERVATIONS_PER_TRACE ||
      content.totalCount > MAX_TRANSCRIPT_OBSERVATIONS,
  };
}
