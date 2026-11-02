// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  MAX_NODES_FOR_GRAPH_UI,
  resolveGraphAvailability,
} from "./graphAvailability";
import { type AgentGraphDataResponse } from "@/src/features/trace-graph-view";

const obs = (
  over: Partial<AgentGraphDataResponse> = {},
): AgentGraphDataResponse =>
  ({
    id: "o1",
    name: "step",
    observationType: "SPAN",
    parentObservationId: "root",
    step: null,
    ...over,
  }) as AgentGraphDataResponse;

describe("resolveGraphAvailability", () => {
  it("reports no data for an empty trace", () => {
    expect(resolveGraphAvailability([])).toEqual({
      available: false,
      reason: "no-data",
    });
  });

  it("refuses traces at the node cap", () => {
    const many = Array.from({ length: MAX_NODES_FOR_GRAPH_UI }, (_, i) =>
      obs({ id: `o${i}`, name: `step-${i}` }),
    );
    expect(resolveGraphAvailability(many)).toEqual({
      available: false,
      reason: "too-large",
    });
  });

  it("is an agent graph when an observation is not span/event/generation", () => {
    expect(
      resolveGraphAvailability([obs({ observationType: "AGENT" })]),
    ).toEqual({ available: true, isAgentGraph: true });
  });

  it("is an agent graph on LangGraph step metadata", () => {
    expect(resolveGraphAvailability([obs({ step: 2 })])).toEqual({
      available: true,
      isAgentGraph: true,
    });
  });

  it("ignores step 0, which carries no LangGraph structure", () => {
    expect(resolveGraphAvailability([obs({ step: 0 })])).toEqual({
      available: false,
      reason: "no-structure",
    });
  });

  it("needs structure beyond the tree for plain span traces", () => {
    expect(
      resolveGraphAvailability([
        obs({ id: "root", name: "trace", parentObservationId: null }),
        obs({ id: "a", name: "only-child" }),
      ]),
    ).toEqual({ available: false, reason: "no-structure" });
  });

  it("counts two distinct children under one root as structure", () => {
    expect(
      resolveGraphAvailability([
        obs({ id: "root", name: "trace", parentObservationId: null }),
        obs({ id: "a", name: "fetch" }),
        obs({ id: "b", name: "rank" }),
      ]),
    ).toEqual({ available: true, isAgentGraph: false });
  });

  it("counts parallel roots as structure", () => {
    expect(
      resolveGraphAvailability([
        obs({ id: "r1", name: "one", parentObservationId: null }),
        obs({ id: "r2", name: "two", parentObservationId: null }),
      ]),
    ).toEqual({ available: true, isAgentGraph: false });
  });

  it("drops events before judging structure", () => {
    expect(
      resolveGraphAvailability([
        obs({ id: "root", name: "trace", parentObservationId: null }),
        obs({ id: "a", name: "only-child" }),
        obs({ id: "e", name: "log", observationType: "EVENT" }),
      ]),
    ).toEqual({ available: false, reason: "no-structure" });
  });
});
