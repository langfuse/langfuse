import { describe, expect, it } from "vitest";

import { mapAgentGraphRecord } from "./mapAgentGraphRecord";

describe("mapAgentGraphRecord", () => {
  it("normalizes an empty root parent id", () => {
    const result = mapAgentGraphRecord(
      {
        id: "observation-1",
        parent_observation_id: "",
        type: "SPAN",
        name: "root",
        start_time: "2026-01-01T00:00:00.000Z",
        end_time: null,
        node: null,
        step: null,
      },
      "trace",
    );

    expect(result?.parentObservationId).toBeNull();
  });
});
