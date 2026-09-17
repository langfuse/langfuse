import { createObservation } from "../../test-utils";
import type { Transcript } from "../types";

/**
 * One transcript test case: a full observation tree as `createObservation`
 * seed records, plus the transcript a human expects the builder to return.
 * The behavior test completes each seed with `createObservation` and converts
 * it to a domain `Observation` with `convertObservation` before building.
 *
 * Expectations pin reviewed message ordering, thread boundaries, and provenance.
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
  expected: Transcript | null;
};
