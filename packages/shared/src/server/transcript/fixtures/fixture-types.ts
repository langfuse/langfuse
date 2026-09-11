import { createObservation } from "../../test-utils";
import type { Transcript, TranscriptConfig } from "../types";

/**
 * One transcript test case: a full observation tree as `createObservation`
 * seed records, plus the transcript a human expects the builder to return.
 * The behavior test completes each seed with `createObservation` and converts
 * it to a domain `Observation` with `convertObservation` before building.
 *
 * `expected` is authored by hand and stays `undefined` until the semantics of
 * the case are decided. Fixtures without an expectation are still valuable:
 * they document real trees, run through the integrity checks, and turn into
 * assertions the moment the expectation is filled in.
 */
export type TranscriptFixture = {
  /** Test name. Describes the tree shape the case exercises. */
  name: string;
  /** `trace`: one trace. `session`: every trace of one session. */
  scope: "trace" | "session";
  /** Why this tree is interesting for transcript semantics. */
  description: string;
  /**
   * Every observation of the trace(s), including types the builder ignores,
   * in the order the export lists them. The builder must not rely on input
   * order, so fixtures never re-sort.
   */
  observations: Parameters<typeof createObservation>[0][];
  /** Builder options for this case. Omitted means defaults. */
  config?: TranscriptConfig;
  expected: Transcript | null | undefined;
};
