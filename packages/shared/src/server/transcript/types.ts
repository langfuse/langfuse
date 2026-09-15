import type { NormalizedMessage } from "../../utils/normalized-io/types";

export type TranscriptConfig = {
  /** Keep `system` messages in the transcript. Defaults to `true`. */
  includeSystemMessages?: boolean;
};

export type ThreadMessage = NormalizedMessage & {
  /** Observation that first emitted this message. */
  observationId: string;
  /** Trace the emitting observation belongs to. Helpful when the transcript
   * spans several traces, for example one session. */
  traceId: string;
};

export type Thread = {
  messages: ThreadMessage[];
  /** Observations that contributed to this thread, in contribution order. */
  observations: { id: string; traceId: string }[];
};

export type Transcript = {
  threads: Thread[];
};
