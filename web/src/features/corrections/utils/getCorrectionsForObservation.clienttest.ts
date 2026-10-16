/**
 * Regression test for https://github.com/langfuse/langfuse/issues/18014:
 * a CORRECTION score created with only a traceId (no observationId) must be
 * displayed when viewing the trace's root observation, which owns the
 * trace-level scores — instead of being silently dropped.
 */
import { type ScoreDomain } from "@langfuse/shared";

import { getCorrectionsForObservation } from "./getCorrectionsForObservation";

const makeCorrection = (
  overrides: Partial<
    Pick<ScoreDomain, "id" | "observationId" | "timestamp">
  > = {},
): ScoreDomain =>
  ({
    id: "correction-id",
    observationId: null,
    timestamp: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }) as unknown as ScoreDomain;

describe("getCorrectionsForObservation", () => {
  const rootObservationId = "obs-root";
  const childObservationId = "obs-child";

  it("includes the observation's own corrections", () => {
    const own = makeCorrection({
      id: "own",
      observationId: rootObservationId,
    });
    const other = makeCorrection({
      id: "other",
      observationId: childObservationId,
    });

    expect(
      getCorrectionsForObservation([own, other], rootObservationId, true).map(
        (c) => c.id,
      ),
    ).toEqual(["own"]);
  });

  it("includes trace-level corrections for the trace-level-score owner (root)", () => {
    const traceLevel = makeCorrection({ id: "trace-level" });
    const own = makeCorrection({
      id: "own",
      observationId: rootObservationId,
    });

    expect(
      getCorrectionsForObservation(
        [traceLevel, own],
        rootObservationId,
        true,
      ).map((c) => c.id),
    ).toEqual(["trace-level", "own"]);
  });

  it("excludes trace-level corrections for non-root observations", () => {
    const traceLevel = makeCorrection({ id: "trace-level" });
    const own = makeCorrection({
      id: "own",
      observationId: childObservationId,
    });

    expect(
      getCorrectionsForObservation(
        [traceLevel, own],
        childObservationId,
        false,
      ).map((c) => c.id),
    ).toEqual(["own"]);
  });

  it("returns an empty array when there are no corrections", () => {
    expect(getCorrectionsForObservation([], rootObservationId, true)).toEqual(
      [],
    );
  });
});
