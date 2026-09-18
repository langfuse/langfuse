import { z } from "zod";
import { stringFilter } from "../../interfaces/filters";
import {
  getObservationsForTraceFromEventsTable,
  MAX_OBSERVATIONS_PER_TRACE,
} from "../repositories/events";
import { orderObservations } from "./ordering";
import { assembleTranscript } from "./transcript";
import type { Transcript } from "./types";

/** The only filter condition supported so far. Widen here to accept more. */
const traceIdFilter = stringFilter.extend({
  column: z.literal("traceId"),
  operator: z.literal("="),
});

export const loadTranscriptInputSchema = z.object({
  projectId: z.string().min(1),
  /** Filter conditions in the shape of the table filters. */
  filter: z.array(traceIdFilter).length(1),
  /** Trace timestamp. Observations from one hour before it onwards are read. */
  timestamp: z.date(),
});

export type LoadTranscriptInput = z.input<typeof loadTranscriptInputSchema>;

export type LoadedTranscript = {
  transcript: Transcript | null;
  /** The trace exceeds the observation cap; later observations were not read. */
  cutoff: boolean;
};

/**
 * Load the trace's observations from the events table, walk them in trace
 * tree order, and assemble the transcript of its generations and tools.
 */
export async function loadTranscript(
  input: LoadTranscriptInput,
): Promise<LoadedTranscript> {
  const { projectId, filter, timestamp } =
    loadTranscriptInputSchema.parse(input);
  const trace = { projectId, traceId: filter[0].value, timestamp };
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
