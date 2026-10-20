import { z } from "zod";
import { storedTranscriptV1Schema } from "../transcript/serialization";

// Add breaking versions alongside v1; deploy readers before enabling new writers.
export const traceBatchInputsSchema = z.object({
  schemaVersion: z.literal(1),
  transcript: storedTranscriptV1Schema.nullable(),
});

export type TraceBatchInputs = z.infer<typeof traceBatchInputsSchema>;
