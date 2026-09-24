import type { NormalizedMessage } from "../../utils/normalized-io/types";

export type ThreadMessage = NormalizedMessage & {
  /** Observation that first emitted this message. */
  observationId: string;
  /** Trace the emitting observation belongs to. Helpful when the transcript
   * spans several traces, for example one session. */
  traceId: string;
  /** Start time of the source observation, not the individual message. */
  startTime: Date;
  /** End time of the source observation; null while unavailable. */
  endTime: Date | null;
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
};
