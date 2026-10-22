import { z } from "zod";
import {
  isoTimestampSchema,
  storedTranscriptV1Schema,
} from "../transcript/versions/v1";

/** Read before the full schema so a newer version is distinguishable from invalid data. */
export const traceBatchInputsVersionSchema = z.object({
  schemaVersion: z.number(),
});

// Add breaking versions alongside v1; deploy readers before enabling new writers.
export const traceBatchInputsSchema = z.object({
  schemaVersion: z.literal(1),
  transcript: storedTranscriptV1Schema.nullable(),
  // Mirrors the event observation domain fields without importing the domain
  // schema; the writer's typed assignment keeps both compatible.
  traceContext: z.object({
    sessionId: z.string().nullable(),
    traceTimestamp: isoTimestampSchema,
    environment: z.string(),
    traceName: z.string().nullable(),
  }),
});

export type TraceBatchInputs = z.infer<typeof traceBatchInputsSchema>;
