import { describe, expect, it } from "vitest";
import { getSelectedObservation } from "./getSelectedObservation";

describe("getSelectedObservation", () => {
  const observations = [
    { id: "shared-id", traceId: "first" },
    { id: "shared-id", traceId: "second" },
    { id: "unique-id", traceId: "second" },
  ];

  it("resolves a trace-qualified session node to its actual observation", () => {
    expect(
      getSelectedObservation(observations, "second:shared-id", "first"),
    ).toEqual(observations[1]);
  });

  it("prefers the anchor trace for an unqualified id", () => {
    expect(getSelectedObservation(observations, "shared-id", "second")).toEqual(
      observations[1],
    );
  });

  it("resolves unique observations across traces and handles missing selections", () => {
    expect(getSelectedObservation(observations, "unique-id", "first")).toEqual(
      observations[2],
    );
    expect(
      getSelectedObservation(observations, "missing", "first"),
    ).toBeUndefined();
    expect(getSelectedObservation(observations, null, "first")).toBeUndefined();
  });
});
