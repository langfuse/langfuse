import type { NormalizedMessage } from "../../utils/normalized-io/types";

export type TranscriptConfig = {
  /** Keep `system` messages in the transcript. Defaults to `true`. */
  includeSystemMessages?: boolean;
};

export type ThreadMessage = NormalizedMessage & {
  /** Observation that first emitted this message. */
  generationId: string;
  /** Trace the emitting observation belongs to. Helpful when the transcript
   * spans several traces, for example one session. */
  traceId: string;
};

export type Thread = {
  messages: ThreadMessage[];
  /** Generations that contributed to this thread, in contribution order. */
  generationIds: string[];
  /** Distinct traces the contributing generations belong to, in first-seen
   * order. A thread spans traces when a later trace replays the history. */
  traceIds: string[];
};

export type Transcript = {
  threads: Thread[];
};
