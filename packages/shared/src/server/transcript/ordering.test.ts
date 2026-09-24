import { describe, expect, it } from "vitest";
import type { Observation } from "../../domain";
import { orderObservations } from "./ordering";

describe("orderObservations", () => {
  const observation = (
    id: string,
    startSecond: number,
    parentObservationId: string | null = null,
  ) =>
    ({
      id,
      parentObservationId,
      startTime: new Date(Date.UTC(2026, 0, 1, 12, 0, startSecond)),
    }) as Observation;

  it("walks the tree depth first with roots and siblings by start time", () => {
    // Span A starts first, but its generation starts after span B's.
    const ordered = orderObservations([
      observation("g2", 2, "B"),
      observation("B", 1),
      observation("g1", 5, "A"),
      observation("A", 0),
    ]);
    expect(ordered.map(({ id }) => id)).toEqual(["A", "g1", "B", "g2"]);
  });

  it("keeps the earliest row per id and roots rows without a known parent", () => {
    const ordered = orderObservations([
      observation("x", 3),
      observation("x", 1),
      observation("orphan", 2, "missing"),
    ]);
    expect(
      ordered.map(({ id, startTime }) => [id, startTime.getUTCSeconds()]),
    ).toEqual([
      ["x", 1],
      ["orphan", 2],
    ]);
  });
});
