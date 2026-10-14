import { describe, expect, it } from "vitest";

import { TRACE_STARTER } from "../types";
import { matchesTraceVisualization } from "./observationVisualization";

describe("matchesTraceVisualization", () => {
  it("treats ClickHouse's empty parent id as a root observation", () => {
    expect(
      matchesTraceVisualization(TRACE_STARTER, {
        id: "root-span",
        parentObservationId: "",
      }),
    ).toBe(true);
  });
});
