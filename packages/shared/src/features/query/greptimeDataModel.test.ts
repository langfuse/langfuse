import { describe, expect, it } from "vitest";
import {
  assertGreptimeSupportedField,
  getGreptimeViewDeclaration,
  getRuntimeViewDeclaration,
  GREPTIME_UNSUPPORTED,
} from "./greptimeDataModel";
import { views } from "./types";

describe("greptimeDataModel", () => {
  it("exposes a GreptimeDB declaration for every dashboard view", () => {
    for (const view of views.options) {
      const decl = getGreptimeViewDeclaration(view);
      expect(decl.baseCte).not.toMatch(/FINAL/i);
      expect(decl.baseCte).not.toMatch(/events_core/);
      // every measure carries GreptimeDB sql
      for (const measure of Object.values(decl.measures)) {
        expect(typeof measure.sql).toBe("string");
        expect(measure.sql.length).toBeGreaterThan(0);
      }
    }
  });

  // Core reachable surface per view. Tool-introspection (toolNames/calledToolNames/toolDefinitions/
  // toolCalls) and experiment/dataset-run fields are deferred (app-side / P4) and intentionally not
  // asserted here.
  const CORE_DIMENSIONS: Record<string, string[]> = {
    traces: ["id", "name", "userId", "sessionId", "environment"],
    observations: [
      "id",
      "traceId",
      "type",
      "name",
      "providedModelName",
      "costType",
      "usageType",
    ],
    "scores-numeric": ["id", "name", "source", "dataType", "value"],
    "scores-categorical": ["id", "name", "source", "dataType", "stringValue"],
  };
  const CORE_MEASURES: Record<string, string[]> = {
    traces: [
      "count",
      "observationsCount",
      "latency",
      "totalTokens",
      "totalCost",
    ],
    observations: [
      "count",
      "latency",
      "totalTokens",
      "totalCost",
      "costByType",
      "usageByType",
    ],
    "scores-numeric": ["count", "value"],
    "scores-categorical": ["count"],
  };

  it("exposes the core dashboard surface per view", () => {
    for (const view of views.options) {
      const greptime = getGreptimeViewDeclaration(view);
      for (const dim of CORE_DIMENSIONS[view]) {
        expect(
          Object.keys(greptime.dimensions),
          `view ${view} missing dimension ${dim}`,
        ).toContain(dim);
      }
      for (const measure of CORE_MEASURES[view]) {
        expect(
          Object.keys(greptime.measures),
          `view ${view} missing measure ${measure}`,
        ).toContain(measure);
      }
    }
  });

  it("is version-agnostic via getRuntimeViewDeclaration", () => {
    for (const view of views.options) {
      expect(getRuntimeViewDeclaration(view, "v1")).toBe(
        getRuntimeViewDeclaration(view, "v2"),
      );
    }
  });

  it("throws for deferred experiment / dataset-run fields", () => {
    for (const field of GREPTIME_UNSUPPORTED) {
      expect(() => assertGreptimeSupportedField(field)).toThrow(
        /not supported on GreptimeDB/i,
      );
    }
    expect(() => assertGreptimeSupportedField("name")).not.toThrow();
  });
});
