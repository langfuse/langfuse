import type { NormalizedMessage } from "../../utils/normalized-io/types";
import type { Observation } from "../../domain";

/** Observation fields consumed by ordering and transcript assembly. */
export type TranscriptObservation = Pick<
  Observation,
  | "id"
  | "traceId"
  | "parentObservationId"
  | "type"
  | "name"
  | "startTime"
  | "input"
  | "output"
  | "metadata"
>;

export type TranscriptOptions = {
  /** Hard limit on JSON.stringify(result).length, including metadata and escaping.
   * Must be a safe integer >= 4, the serialized size of null. Unlimited by default. */
  maxCharacters?: number;
  onTimings?: (timings: {
    normalizationMs: number;
    matchingMs: number;
  }) => void;
};

export type ThreadMessage = NormalizedMessage & {
  /** Observation that first emitted this message. */
  observationId: string;
  /** Trace the emitting observation belongs to. Helpful when the transcript
   * spans several traces, for example one session. */
  traceId: string;
};

/** Messages of one turn with the observations that emitted them. */
export type Turn = {
  messages: ThreadMessage[];
  /** Observations that contributed to this turn, in contribution order. */
  observations: { id: string; traceId: string }[];
};

export type Thread = {
  /** Messages replayed from earlier turns, in replay order, without provenance. */
  conversationHistory: NormalizedMessage[];
  /** Messages the supplied observations added to the conversation. */
  currentTurn: Turn;
};

export type Transcript = {
  threads: Thread[];
  /** The character limit shortened text or omitted messages. */
  truncated?: true;
};
