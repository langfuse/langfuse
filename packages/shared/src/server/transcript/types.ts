import type { z } from "zod";
import type {
  threadMessageSchema,
  turnSchema,
  threadSchema,
  transcriptSchema,
} from "./schema";
import type { Observation } from "../../domain";

export type TranscriptOptions = {
  /** Hard limit on JSON.stringify(result).length, including metadata and escaping.
   * Must be a safe integer >= 4, the serialized size of null. Unlimited by default. */
  maxCharacters?: number;
  onTimings?: (timings: {
    normalizationMs: number;
    matchingMs: number;
  }) => void;
};

/** Observation fields consumed by ordering and transcript assembly. */
export type TranscriptObservation = Pick<
  Observation,
  | "id"
  | "traceId"
  | "parentObservationId"
  | "type"
  | "name"
  | "startTime"
  | "endTime"
  | "input"
  | "output"
  | "metadata"
>;

export type ThreadMessage = z.infer<typeof threadMessageSchema>;
export type Turn = z.infer<typeof turnSchema>;
export type Thread = z.infer<typeof threadSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
