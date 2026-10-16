import { describe, expect, it } from "vitest";

import { TOOL_STARTER, TRACE_STARTER } from "../types";
import {
  buildObservationVisualizationData,
  matchesObservationVisualization,
  matchesTraceVisualization,
} from "./observationVisualization";

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

describe("observation Custom UI destinations", () => {
  const observation = {
    id: "tool-1",
    type: "TOOL",
    name: "stripe.create-refund",
    output: { status: "succeeded" },
  };

  it("can reuse one definition in Session and Trace observation detail", () => {
    expect(
      matchesObservationVisualization(TOOL_STARTER, observation, "SESSION"),
    ).toBe(true);
    expect(
      matchesObservationVisualization(TOOL_STARTER, observation, "TRACE"),
    ).toBe(true);
    expect(
      buildObservationVisualizationData(TOOL_STARTER, observation, "TRACE").meta
        .surface,
    ).toBe("TRACE");
  });

  it("honors a single selected destination", () => {
    const sessionOnly = {
      ...TOOL_STARTER,
      placement: {
        ...TOOL_STARTER.placement,
        destinations: ["SESSION" as const],
      },
    };
    expect(
      matchesObservationVisualization(sessionOnly, observation, "SESSION"),
    ).toBe(true);
    expect(
      matchesObservationVisualization(sessionOnly, observation, "TRACE"),
    ).toBe(false);
  });
});
