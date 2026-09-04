// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  canSelectObservationView,
  getTraceDetailModeTitle,
  getSelectedObservation,
  getSelectedObservationType,
} from "@/src/features/traces/fns/getSelectedObservationType";

describe("getSelectedObservationType", () => {
  const observations = [
    { id: "shared", traceId: "trace-1", type: "GENERATION" as const },
    { id: "shared", traceId: "trace-2", type: "SPAN" as const },
  ];

  it("resolves a trace-qualified session observation", () => {
    expect(getSelectedObservationType(observations, "trace-2:shared")).toBe(
      "SPAN",
    );
  });

  it("returns null when no observation is selected", () => {
    expect(getSelectedObservationType(observations, undefined)).toBeNull();
  });

  it("only enables observation view for observation node ids", () => {
    expect(canSelectObservationView("observation-1")).toBe(true);
    expect(canSelectObservationView("trace-trace-1")).toBe(false);
    expect(canSelectObservationView("session-session-1")).toBe(false);
    expect(canSelectObservationView(undefined)).toBe(false);
  });

  it("uses the title belonging to the active mode", () => {
    const trace = {
      id: "trace-1",
      name: "Trace name",
      sessionId: "session-1",
    };
    const observation = {
      id: "observation-1",
      name: "Observation name",
      type: "GENERATION" as const,
    };

    expect(
      getTraceDetailModeTitle("observation", trace, observation, undefined),
    ).toBe("Observation name");
    expect(
      getTraceDetailModeTitle("trace", trace, observation, undefined),
    ).toBe("Trace name: trace-1");
    expect(
      getTraceDetailModeTitle("session", trace, observation, undefined),
    ).toBe("session-1");
  });

  it("resolves the selected observation data for its name and type", () => {
    expect(getSelectedObservation(observations, "trace-2:shared")).toEqual(
      observations[1],
    );
  });
});
