import { describe, expect, it } from "vitest";
import { dedupeObservations } from "./dedupeObservations";

describe("dedupeObservations", () => {
  it("keeps the first occurrence of each observation id", () => {
    const first = { id: "observation-1", name: "first" };
    const duplicate = { id: "observation-1", name: "duplicate" };
    const second = { id: "observation-2", name: "second" };

    expect(dedupeObservations([first, duplicate, second])).toEqual([
      first,
      second,
    ]);
  });
});
