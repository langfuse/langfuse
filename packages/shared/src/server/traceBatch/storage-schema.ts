import { z } from "zod";
import { EventsObservationSchema } from "../../domain/observations";
import { storedTranscriptV1Schema } from "../transcript/serialization";

// Add breaking versions alongside v1; deploy readers before enabling new writers.
export const traceBatchInputsSchema = z.object({
  schemaVersion: z.literal(1),
  transcript: storedTranscriptV1Schema.nullable(),
  traceContext: EventsObservationSchema.pick({
    sessionId: true,
    environment: true,
    traceName: true,
  }).extend({ traceTimestamp: z.iso.datetime() }),
});

export type TraceBatchInputs = z.infer<typeof traceBatchInputsSchema>;
