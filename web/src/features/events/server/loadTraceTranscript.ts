import {
  assembleTranscript,
  getObservationsForTraceFromEventsTable,
  MAX_OBSERVATIONS_PER_TRACE,
  orderObservations,
  type Transcript,
} from "@langfuse/shared/src/server";

/**
 * Load a trace's observations from the events table, walk them in trace tree
 * order, and assemble the transcript of its generations and tools.
 */
export async function loadTraceTranscript(trace: {
  projectId: string;
  traceId: string;
  /** Trace timestamp; observations from one hour before it onwards are read. */
  timestamp: Date;
}): Promise<{ transcript: Transcript | null; cutoff: boolean }> {
  // The structure of every observation orders the walk; only generations and
  // tools carry I/O, which is what the transcript reads.
  const [structure, content] = await Promise.all([
    getObservationsForTraceFromEventsTable(trace),
    getObservationsForTraceFromEventsTable({
      ...trace,
      selectIOAndMetadata: true,
      types: ["GENERATION", "TOOL"],
    }),
  ]);
  // Both reads stop at the per-trace observation cap. The structure decides
  // what exists, so the transcript ends where the trace tree ends; content
  // rows past that point are dropped and `cutoff` tells the caller.
  const contentById = new Map(content.observations.map((o) => [o.id, o]));
  const observations = structure.observations.map(
    (o) => contentById.get(o.id) ?? o,
  );
  return {
    transcript: assembleTranscript(orderObservations(observations)),
    cutoff: structure.totalCount > MAX_OBSERVATIONS_PER_TRACE,
  };
}
