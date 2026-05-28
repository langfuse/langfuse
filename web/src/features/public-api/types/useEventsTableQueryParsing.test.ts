import { describe, it, expect } from "vitest";

import { GetObservationsV1Query } from "./observations";
import { GetTracesV1Query } from "./traces";

describe("useEventsTable query parsing", () => {
  it("keeps useEventsTable undefined when query param is omitted", () => {
    const now = new Date().toISOString();

    const traces = GetTracesV1Query.parse({
      fromTimestamp: now,
      toTimestamp: now,
    });
    expect(traces.useEventsTable).toBeUndefined();

    const observations = GetObservationsV1Query.parse({
      fromStartTime: now,
      toStartTime: now,
    });
    expect(observations.useEventsTable).toBeUndefined();
  });

  it("parses explicit useEventsTable overrides", () => {
    const now = new Date().toISOString();

    const traces = GetTracesV1Query.parse({
      fromTimestamp: now,
      toTimestamp: now,
      useEventsTable: "false",
    });
    expect(traces.useEventsTable).toBe(false);

    const observations = GetObservationsV1Query.parse({
      fromStartTime: now,
      toStartTime: now,
      useEventsTable: "true",
    });
    expect(observations.useEventsTable).toBe(true);
  });
});
