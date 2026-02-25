/**
 * Tests for tree-building utilities.
 *
 * Run with: pnpm test-client --testPathPattern="tree-building"
 */

import {
  buildTraceUiData,
  removeHiddenNodes,
  getObservationLevels,
} from "./tree-building";
import { type TreeNode } from "./types";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import Decimal from "decimal.js";

// Helper to create mock observations
const createMockObservation = (
  overrides: Partial<ObservationReturnType> = {},
): ObservationReturnType => ({
  id: "mock-id",
  name: "Mock Observation",
  type: "SPAN",
  startTime: new Date("2024-01-01T00:00:00.000Z"),
  endTime: new Date("2024-01-01T00:00:01.000Z"),
  parentObservationId: null,
  traceId: "mock-trace-id",
  projectId: "mock-project-id",
  environment: "production",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  level: "DEFAULT",
  statusMessage: null,
  version: null,
  model: null,
  internalModelId: null,
  modelParameters: null,
  inputCost: null,
  outputCost: null,
  totalCost: null,
  completionStartTime: null,
  timeToFirstToken: null,
  promptId: null,
  promptName: null,
  promptVersion: null,
  inputUsage: 0,
  outputUsage: 0,
  totalUsage: 0,
  usageDetails: {},
  costDetails: {},
  providedCostDetails: {},
  latency: null,
  usagePricingTierId: null,
  usagePricingTierName: null,
  toolDefinitions: null,
  toolCalls: null,
  toolCallNames: null,
  ...overrides,
});

// Helper to create mock trace
const createMockTrace = (overrides: Record<string, unknown> = {}) => ({
  id: "mock-trace-id",
  name: "Mock Trace",
  timestamp: new Date("2024-01-01T00:00:00.000Z"),
  projectId: "mock-project-id",
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  public: false,
  bookmarked: false,
  metadata: "{}",
  release: null,
  version: null,
  userId: null,
  sessionId: null,
  input: null,
  output: null,
  tags: [],
  environment: "default",
  latency: 1.5,
  ...overrides,
});

describe("buildTraceUiData", () => {
  describe("Traditional traces (single TRACE root)", () => {
    it("creates roots array with TRACE as single root and observations as children", () => {
      const trace = createMockTrace({ id: "trace-1", name: "Test Trace" });
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          name: "Observation 1",
          parentObservationId: null,
          startTime: new Date("2024-01-01T00:00:00.100Z"),
        }),
        createMockObservation({
          id: "obs-2",
          name: "Observation 2",
          parentObservationId: null,
          startTime: new Date("2024-01-01T00:00:00.200Z"),
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      // Should have single root (TRACE wrapper)
      expect(result.roots).toHaveLength(1);
      expect(result.roots[0].id).toBe("trace-trace-1");
      expect(result.roots[0].type).toBe("TRACE");
      expect(result.roots[0].name).toBe("Test Trace");

      // Should have 2 child observations
      expect(result.roots[0].children).toHaveLength(2);
      expect(result.roots[0].children[0].id).toBe("obs-1");
      expect(result.roots[0].children[1].id).toBe("obs-2");
    });

    it("nests child observations under parent observations", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "parent",
          name: "Parent",
          parentObservationId: null,
          startTime: new Date("2024-01-01T00:00:00.000Z"),
        }),
        createMockObservation({
          id: "child-1",
          name: "Child 1",
          parentObservationId: "parent",
          startTime: new Date("2024-01-01T00:00:01.000Z"),
        }),
        createMockObservation({
          id: "child-2",
          name: "Child 2",
          parentObservationId: "parent",
          startTime: new Date("2024-01-01T00:00:02.000Z"),
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      // Should have 1 root observation under trace
      expect(result.roots[0].children).toHaveLength(1);
      const parent = result.roots[0].children[0];
      expect(parent.id).toBe("parent");

      // Parent should have 2 children
      expect(parent.children).toHaveLength(2);
      expect(parent.children[0].id).toBe("child-1");
      expect(parent.children[1].id).toBe("child-2");
    });

    it("populates nodeMap for O(1) lookup", () => {
      const trace = createMockTrace({ id: "trace-1" });
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          parentObservationId: null,
        }),
        createMockObservation({
          id: "obs-2",
          parentObservationId: "obs-1",
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      // nodeMap should contain trace and both observations
      expect(result.nodeMap.size).toBe(3);
      expect(result.nodeMap.has("trace-trace-1")).toBe(true);
      expect(result.nodeMap.has("obs-1")).toBe(true);
      expect(result.nodeMap.has("obs-2")).toBe(true);

      // Should be able to get nodes by ID
      const obs1 = result.nodeMap.get("obs-1");
      expect(obs1?.name).toBe("Mock Observation");
    });

    it("generates searchItems list with all nodes", () => {
      const trace = createMockTrace({ id: "trace-1", latency: 2.0 });
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          parentObservationId: null,
        }),
        createMockObservation({
          id: "obs-2",
          parentObservationId: "obs-1",
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      // searchItems should contain trace + all observations (flattened)
      expect(result.searchItems).toHaveLength(3);

      // First item should be trace (undefined observationId)
      expect(result.searchItems[0].node.type).toBe("TRACE");
      expect(result.searchItems[0].observationId).toBeUndefined();

      // Other items should have observationId set
      expect(result.searchItems[1].observationId).toBe("obs-1");
      expect(result.searchItems[2].observationId).toBe("obs-2");

      // All items should have parent duration for heatmap
      expect(result.searchItems[0].parentTotalDuration).toBe(2000); // 2s * 1000ms
    });

    it("returns empty children for trace with no observations", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [];

      const result = buildTraceUiData(trace, observations);

      expect(result.roots).toHaveLength(1);
      expect(result.roots[0].children).toHaveLength(0);
      expect(result.searchItems).toHaveLength(1); // Just the trace
    });

    it("sorts children by startTime", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-late",
          parentObservationId: null,
          startTime: new Date("2024-01-01T00:00:02.000Z"),
        }),
        createMockObservation({
          id: "obs-early",
          parentObservationId: null,
          startTime: new Date("2024-01-01T00:00:00.000Z"),
        }),
        createMockObservation({
          id: "obs-middle",
          parentObservationId: null,
          startTime: new Date("2024-01-01T00:00:01.000Z"),
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      // Children should be sorted by startTime
      expect(result.roots[0].children[0].id).toBe("obs-early");
      expect(result.roots[0].children[1].id).toBe("obs-middle");
      expect(result.roots[0].children[2].id).toBe("obs-late");
    });

    it("preserves all TRACE node properties", () => {
      const trace = createMockTrace({
        id: "trace-1",
        name: "Test Trace",
        latency: 2.5,
      });
      const observations: ObservationReturnType[] = [
        createMockObservation({ id: "obs-1", totalCost: 0.5 }),
      ];

      const result = buildTraceUiData(trace, observations);
      const traceNode = result.roots[0];

      expect(traceNode.name).toBe("Test Trace");
      expect(traceNode.latency).toBe(2.5);
      expect(traceNode.totalCost?.toNumber()).toBe(0.5);
      expect(traceNode.depth).toBe(-1);
      expect(traceNode.startTimeSinceTrace).toBe(0);
    });
  });

  describe("Events-based traces (multiple roots)", () => {
    it("returns single observation as root when rootObservationType is set", () => {
      const trace = createMockTrace({
        id: "trace-1",
        rootObservationType: "GENERATION",
      });
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "gen-1",
          name: "Generation",
          type: "GENERATION",
          parentObservationId: null,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      // Should have single root (the observation, NOT a TRACE wrapper)
      expect(result.roots).toHaveLength(1);
      expect(result.roots[0].id).toBe("gen-1");
      expect(result.roots[0].type).toBe("GENERATION");
      expect(result.roots[0].name).toBe("Generation");
    });

    it("returns empty roots array for events-based trace with no observations", () => {
      const trace = createMockTrace({
        id: "trace-1",
        rootObservationType: "SPAN",
      });
      const observations: ObservationReturnType[] = [];

      const result = buildTraceUiData(trace, observations);

      expect(result.roots).toHaveLength(0);
      expect(result.searchItems).toHaveLength(0);
    });

    it("builds multiple roots with children, sorted by startTime", () => {
      //   root-late (02:00)     root-early (00:00)
      //        |                      |
      //   child-late              child-early

      const trace = createMockTrace({
        id: "trace-1",
        rootObservationType: "SPAN",
      });
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "root-late",
          parentObservationId: null,
          startTime: new Date("2024-01-01T00:00:02.000Z"),
        }),
        createMockObservation({
          id: "child-late",
          parentObservationId: "root-late",
          startTime: new Date("2024-01-01T00:00:02.100Z"),
        }),
        createMockObservation({
          id: "root-early",
          parentObservationId: null,
          startTime: new Date("2024-01-01T00:00:00.000Z"),
        }),
        createMockObservation({
          id: "child-early",
          parentObservationId: "root-early",
          startTime: new Date("2024-01-01T00:00:00.100Z"),
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      // Roots sorted by startTime (no TRACE wrapper), with children
      expect(result.roots).toMatchObject([
        { id: "root-early", children: [{ id: "child-early" }] },
        { id: "root-late", children: [{ id: "child-late" }] },
      ]);

      // nodeMap has all observations, no TRACE entry
      expect(result.nodeMap.has("root-early")).toBe(true);
      expect(result.nodeMap.has("child-late")).toBe(true);
      expect(result.nodeMap.has("trace-trace-1")).toBe(false);

      // searchItems has no TRACE node
      expect(result.searchItems.every((s) => s.node.type !== "TRACE")).toBe(
        true,
      );
    });
  });

  describe("Cost Aggregation - Fundamentals", () => {
    it("treats null costs as undefined (not zero)", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          inputCost: null,
          outputCost: null,
          totalCost: null,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const obs = result.nodeMap.get("obs-1");
      expect(obs?.totalCost).toBeUndefined();
      expect(result.roots[0].totalCost).toBeUndefined();
    });

    it("treats zero costs as undefined", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          totalCost: 0,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const obs = result.nodeMap.get("obs-1");
      expect(obs?.totalCost).toBeUndefined();
    });

    it("treats zero input + output as undefined", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          inputCost: 0,
          outputCost: 0,
          totalCost: null,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const obs = result.nodeMap.get("obs-1");
      expect(obs?.totalCost).toBeUndefined();
    });

    it("uses inputCost when only input is set", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          inputCost: 0.5,
          outputCost: null,
          totalCost: null,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const obs = result.nodeMap.get("obs-1");
      expect(obs?.totalCost).toBeDefined();
      expect(obs?.totalCost?.equals(new Decimal(0.5))).toBe(true);
    });

    it("uses outputCost when only output is set", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          inputCost: null,
          outputCost: 0.3,
          totalCost: null,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const obs = result.nodeMap.get("obs-1");
      expect(obs?.totalCost).toBeDefined();
      expect(obs?.totalCost?.equals(new Decimal(0.3))).toBe(true);
    });

    it("sums input + output when both are set", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          inputCost: 0.5,
          outputCost: 0.3,
          totalCost: null,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const obs = result.nodeMap.get("obs-1");
      expect(obs?.totalCost).toBeDefined();
      expect(obs?.totalCost?.equals(new Decimal(0.8))).toBe(true);
    });

    it("prefers totalCost over input + output", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          inputCost: 0.5,
          outputCost: 0.3,
          totalCost: 0.9, // Different from sum
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const obs = result.nodeMap.get("obs-1");
      expect(obs?.totalCost).toBeDefined();
      expect(obs?.totalCost?.equals(new Decimal(0.9))).toBe(true);
    });

    it("treats zero totalCost as undefined (does not fall back to input+output)", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          inputCost: 0.5,
          outputCost: 0.3,
          totalCost: 0, // Zero means "no cost"
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const obs = result.nodeMap.get("obs-1");
      // Zero totalCost is treated as undefined (explicit "no cost")
      // Does NOT fall back to input+output
      expect(obs?.totalCost).toBeUndefined();
    });
  });

  describe("Cost Aggregation - Hierarchical", () => {
    it("sums parent and children costs when both have costs", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "parent",
          parentObservationId: null,
          totalCost: 0.5,
        }),
        createMockObservation({
          id: "child-1",
          parentObservationId: "parent",
          totalCost: 0.3,
        }),
        createMockObservation({
          id: "child-2",
          parentObservationId: "parent",
          totalCost: 0.2,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const parent = result.nodeMap.get("parent");
      expect(parent?.totalCost).toBeDefined();
      expect(parent?.totalCost?.equals(new Decimal(1.0))).toBe(true);
    });

    it("bubbles up children costs when parent has no cost", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "parent",
          parentObservationId: null,
          totalCost: null,
        }),
        createMockObservation({
          id: "child-1",
          parentObservationId: "parent",
          totalCost: 0.3,
        }),
        createMockObservation({
          id: "child-2",
          parentObservationId: "parent",
          totalCost: 0.2,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const parent = result.nodeMap.get("parent");
      expect(parent?.totalCost).toBeDefined();
      expect(parent?.totalCost?.equals(new Decimal(0.5))).toBe(true);
    });

    it("uses only parent cost when children have no costs", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "parent",
          parentObservationId: null,
          totalCost: 0.5,
        }),
        createMockObservation({
          id: "child-1",
          parentObservationId: "parent",
          totalCost: null,
        }),
        createMockObservation({
          id: "child-2",
          parentObservationId: "parent",
          totalCost: null,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const parent = result.nodeMap.get("parent");
      expect(parent?.totalCost).toBeDefined();
      expect(parent?.totalCost?.equals(new Decimal(0.5))).toBe(true);
    });

    it("aggregates costs through deep nesting (3 levels)", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "grandparent",
          parentObservationId: null,
          totalCost: 0.1,
        }),
        createMockObservation({
          id: "parent",
          parentObservationId: "grandparent",
          totalCost: 0.2,
        }),
        createMockObservation({
          id: "child",
          parentObservationId: "parent",
          totalCost: 0.3,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const grandparent = result.nodeMap.get("grandparent");
      const parent = result.nodeMap.get("parent");
      const child = result.nodeMap.get("child");

      expect(child?.totalCost?.equals(new Decimal(0.3))).toBe(true);
      expect(parent?.totalCost?.equals(new Decimal(0.5))).toBe(true); // 0.2 + 0.3
      expect(grandparent?.totalCost?.equals(new Decimal(0.6))).toBe(true); // 0.1 + 0.5
    });

    it("handles gaps in cost hierarchy (parent has no cost)", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "grandparent",
          parentObservationId: null,
          totalCost: 0.1,
        }),
        createMockObservation({
          id: "parent",
          parentObservationId: "grandparent",
          totalCost: null, // Gap here
        }),
        createMockObservation({
          id: "child",
          parentObservationId: "parent",
          totalCost: 0.3,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const grandparent = result.nodeMap.get("grandparent");
      const parent = result.nodeMap.get("parent");

      expect(parent?.totalCost?.equals(new Decimal(0.3))).toBe(true); // Just child's cost
      expect(grandparent?.totalCost?.equals(new Decimal(0.4))).toBe(true); // 0.1 + 0.3
    });

    it("handles mixed cost types among siblings", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "parent",
          parentObservationId: null,
          totalCost: null,
        }),
        createMockObservation({
          id: "child-1",
          parentObservationId: "parent",
          totalCost: 0.5, // Uses totalCost
        }),
        createMockObservation({
          id: "child-2",
          parentObservationId: "parent",
          inputCost: 0.2,
          outputCost: 0.1,
          totalCost: null, // Uses input+output
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const parent = result.nodeMap.get("parent");
      expect(parent?.totalCost).toBeDefined();
      expect(parent?.totalCost?.equals(new Decimal(0.8))).toBe(true); // 0.5 + 0.3
    });
  });

  describe("Cost Aggregation - Edge Cases", () => {
    it("does not double-count costs (parent with input/output + child)", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "parent",
          parentObservationId: null,
          inputCost: 0.5,
          outputCost: 0.3,
          totalCost: null,
        }),
        createMockObservation({
          id: "child",
          parentObservationId: "parent",
          totalCost: 0.2,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const parent = result.nodeMap.get("parent");
      // Should be 0.8 (parent's 0.5+0.3) + 0.2 (child) = 1.0
      // NOT 0.5 + 0.3 + 0.8 (double-counting parent)
      expect(parent?.totalCost?.equals(new Decimal(1.0))).toBe(true);
    });

    it("aggregates costs at trace root level", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          parentObservationId: null,
          totalCost: 0.5,
        }),
        createMockObservation({
          id: "obs-2",
          parentObservationId: null,
          totalCost: 0.3,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      // Trace root should sum all top-level observations
      expect(result.roots[0].totalCost).toBeDefined();
      expect(result.roots[0].totalCost?.equals(new Decimal(0.8))).toBe(true);
    });

    it("propagates trace totalCost to all searchItems as parentTotalCost", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "obs-1",
          parentObservationId: null,
          totalCost: 0.5,
        }),
        createMockObservation({
          id: "obs-2",
          parentObservationId: null,
          totalCost: 0.3,
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      // All searchItems should have the trace's total cost as parentTotalCost
      const traceTotalCost = result.roots[0].totalCost;
      expect(traceTotalCost).toBeDefined();

      result.searchItems.forEach((item) => {
        expect(item.parentTotalCost).toBeDefined();
        expect(item.parentTotalCost?.equals(traceTotalCost!)).toBe(true);
      });
    });

    it("handles zero costs correctly in hierarchy (should not propagate)", () => {
      const trace = createMockTrace();
      const observations: ObservationReturnType[] = [
        createMockObservation({
          id: "parent",
          parentObservationId: null,
          totalCost: 0, // Zero cost
        }),
        createMockObservation({
          id: "child",
          parentObservationId: "parent",
          totalCost: 0, // Zero cost
        }),
      ];

      const result = buildTraceUiData(trace, observations);

      const parent = result.nodeMap.get("parent");
      const child = result.nodeMap.get("child");

      // Both should have undefined totalCost (zero is treated as undefined)
      expect(child?.totalCost).toBeUndefined();
      expect(parent?.totalCost).toBeUndefined();
      expect(result.roots[0].totalCost).toBeUndefined();
    });
  });

  describe.skip("Performance Tests", () => {
    // Helper to generate observations at scale
    const generateObservations = (
      count: number,
      structure: "flat" | "deep" | "balanced" | "realistic",
      withCosts: boolean,
    ): ObservationReturnType[] => {
      const observations: ObservationReturnType[] = [];
      const baseCost = withCosts ? 0.001 : null;

      if (structure === "flat") {
        // All observations at root level
        for (let i = 0; i < count; i++) {
          observations.push(
            createMockObservation({
              id: `obs-${i}`,
              parentObservationId: null,
              totalCost: baseCost,
              startTime: new Date(`2024-01-01T00:00:${i % 60}.${i % 1000}Z`),
            }),
          );
        }
      } else if (structure === "deep") {
        // Single linear chain (worst case for recursion)
        for (let i = 0; i < count; i++) {
          observations.push(
            createMockObservation({
              id: `obs-${i}`,
              parentObservationId: i === 0 ? null : `obs-${i - 1}`,
              totalCost: baseCost,
              startTime: new Date(`2024-01-01T00:00:${i % 60}.${i % 1000}Z`),
            }),
          );
        }
      } else if (structure === "balanced") {
        // Binary tree structure
        for (let i = 0; i < count; i++) {
          const parentIndex = i === 0 ? null : Math.floor((i - 1) / 2);
          observations.push(
            createMockObservation({
              id: `obs-${i}`,
              parentObservationId:
                parentIndex === null ? null : `obs-${parentIndex}`,
              totalCost: baseCost,
              startTime: new Date(`2024-01-01T00:00:${i % 60}.${i % 1000}Z`),
            }),
          );
        }
      } else {
        // Realistic: ~20% intermediate nodes, ~80% leaf nodes, max depth ~5
        const intermediateNodeCount = Math.floor(count * 0.2);
        const leafNodeCount = count - intermediateNodeCount;

        // Create root nodes (no parent) - 10% of intermediate nodes
        const rootCount = Math.max(1, Math.floor(intermediateNodeCount * 0.1));
        for (let i = 0; i < rootCount; i++) {
          observations.push(
            createMockObservation({
              id: `obs-${i}`,
              parentObservationId: null,
              totalCost: baseCost,
              startTime: new Date(`2024-01-01T00:00:${i % 60}.${i % 1000}Z`),
            }),
          );
        }

        // Create remaining intermediate nodes - attach to previous nodes
        for (let i = rootCount; i < intermediateNodeCount; i++) {
          const parentIndex = Math.floor(Math.random() * i);
          observations.push(
            createMockObservation({
              id: `obs-${i}`,
              parentObservationId: `obs-${parentIndex}`,
              totalCost: baseCost,
              startTime: new Date(`2024-01-01T00:00:${i % 60}.${i % 1000}Z`),
            }),
          );
        }

        // Create leaf nodes - attach to any intermediate node
        for (let i = 0; i < leafNodeCount; i++) {
          const obsId = intermediateNodeCount + i;
          const parentIndex =
            intermediateNodeCount === 0
              ? null
              : Math.floor(Math.random() * intermediateNodeCount);
          observations.push(
            createMockObservation({
              id: `obs-${obsId}`,
              parentObservationId:
                parentIndex === null ? null : `obs-${parentIndex}`,
              totalCost: baseCost,
              startTime: new Date(
                `2024-01-01T00:00:${obsId % 60}.${obsId % 1000}Z`,
              ),
            }),
          );
        }
      }

      return observations;
    };

    const runPerformanceTest = (
      scale: number,
      structure: "flat" | "deep" | "balanced" | "realistic",
      withCosts: boolean,
      threshold: number,
    ) => {
      const trace = createMockTrace();
      const observations = generateObservations(scale, structure, withCosts);

      const start = Date.now();
      const result = buildTraceUiData(trace, observations);
      const duration = Date.now() - start;

      // Verify correct structure was built
      expect(result.nodeMap.size).toBe(scale + 1); // +1 for trace root
      expect(result.searchItems.length).toBe(scale + 1);

      // Log performance metrics
      console.log(
        `${scale.toLocaleString()} observations (${structure}, ${withCosts ? "with costs" : "no costs"}): ${duration}ms`,
      );

      // Assert threshold (generous to avoid flakiness)
      expect(duration).toBeLessThan(threshold);

      return duration;
    };

    describe("1k observations", () => {
      const scale = 1_000;
      const threshold = 100; // 100ms

      it("builds flat structure", () => {
        runPerformanceTest(scale, "flat", false, threshold);
      });

      it("builds deep chain", () => {
        runPerformanceTest(scale, "deep", false, threshold);
      });

      it("builds balanced tree", () => {
        runPerformanceTest(scale, "balanced", false, threshold);
      });

      it("builds realistic structure", () => {
        runPerformanceTest(scale, "realistic", false, threshold);
      });

      it("builds with cost aggregation", () => {
        runPerformanceTest(scale, "realistic", true, threshold);
      });
    });

    describe("10k observations", () => {
      const scale = 10_000;
      const threshold = 500; // 500ms

      it("builds flat structure", () => {
        runPerformanceTest(scale, "flat", false, threshold);
      });

      // Deep chain skipped - causes stack overflow at this scale
      it("builds deep chain", () => {
        runPerformanceTest(scale, "deep", false, threshold);
      });

      it("builds balanced tree", () => {
        runPerformanceTest(scale, "balanced", false, threshold);
      });

      it("builds realistic structure", () => {
        runPerformanceTest(scale, "realistic", false, threshold);
      });

      it("builds with cost aggregation", () => {
        runPerformanceTest(scale, "realistic", true, threshold);
      });
    });

    describe("25k observations", () => {
      const scale = 25_000;
      const threshold = 2_000; // 2s

      it("builds flat structure", () => {
        runPerformanceTest(scale, "flat", false, threshold);
      });

      it("builds realistic structure", () => {
        runPerformanceTest(scale, "realistic", false, threshold);
      });

      it("builds with cost aggregation", () => {
        runPerformanceTest(scale, "realistic", true, threshold);
      });
    });

    describe("50k observations", () => {
      const scale = 50_000;
      const threshold = 5_000; // 5s

      it("builds flat structure", () => {
        runPerformanceTest(scale, "flat", false, threshold);
      });

      it("builds realistic structure", () => {
        runPerformanceTest(scale, "realistic", false, threshold);
      });

      it("builds with cost aggregation", () => {
        runPerformanceTest(scale, "realistic", true, threshold);
      });
    });

    describe("100k observations", () => {
      const scale = 100_000;
      const threshold = 15_000; // 15s

      it("builds flat structure", () => {
        runPerformanceTest(scale, "flat", false, threshold);
      });

      it("builds realistic structure", () => {
        runPerformanceTest(scale, "realistic", false, threshold);
      });

      it("builds with cost aggregation", () => {
        runPerformanceTest(scale, "realistic", true, threshold);
      });
    });

    describe("500k observations (extreme - manual only)", () => {
      const scale = 500_000;
      const threshold = 60_000; // 60s

      it("builds realistic structure", () => {
        runPerformanceTest(scale, "realistic", false, threshold);
      });

      it("builds with cost aggregation", () => {
        runPerformanceTest(scale, "realistic", true, threshold);
      });
    });

    describe("1M observations (extreme - manual only)", () => {
      const scale = 1_000_000;
      const threshold = 180_000; // 3 minutes

      it("builds realistic structure", () => {
        runPerformanceTest(scale, "realistic", false, threshold);
      });

      it("builds with cost aggregation", () => {
        runPerformanceTest(scale, "realistic", true, threshold);
      });
    });
  });

  describe("Temporal and Depth Properties", () => {
    describe("Basic Calculations", () => {
      it("calculates startTimeSinceTrace for single observation", () => {
        const trace = createMockTrace({
          id: "trace-1",
          timestamp: new Date("2024-01-01T00:00:00.000Z"),
        });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "obs-1",
            name: "Observation 1",
            parentObservationId: null,
            startTime: new Date("2024-01-01T00:00:02.500Z"), // 2500ms after trace
          }),
        ];

        const result = buildTraceUiData(trace, observations);
        const obs1 = result.nodeMap.get("obs-1");

        expect(obs1?.startTimeSinceTrace).toBe(2500);
      });

      it("calculates startTimeSinceParentStart for parent-child pair", () => {
        const trace = createMockTrace({
          id: "trace-1",
          timestamp: new Date("2024-01-01T00:00:00.000Z"),
        });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "parent",
            name: "Parent",
            parentObservationId: null,
            startTime: new Date("2024-01-01T00:00:01.000Z"), // +1000ms
          }),
          createMockObservation({
            id: "child",
            name: "Child",
            parentObservationId: "parent",
            startTime: new Date("2024-01-01T00:00:01.300Z"), // +300ms from parent
          }),
        ];

        const result = buildTraceUiData(trace, observations);
        const parent = result.nodeMap.get("parent");
        const child = result.nodeMap.get("child");

        expect(parent?.startTimeSinceTrace).toBe(1000);
        expect(parent?.startTimeSinceParentStart).toBeNull();

        expect(child?.startTimeSinceTrace).toBe(1300);
        expect(child?.startTimeSinceParentStart).toBe(300);
      });

      it("sets startTimeSinceParentStart to null for root observations", () => {
        const trace = createMockTrace({
          id: "trace-1",
          timestamp: new Date("2024-01-01T00:00:00.000Z"),
        });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "root-1",
            parentObservationId: null,
            startTime: new Date("2024-01-01T00:00:01.000Z"),
          }),
          createMockObservation({
            id: "root-2",
            parentObservationId: null,
            startTime: new Date("2024-01-01T00:00:02.000Z"),
          }),
        ];

        const result = buildTraceUiData(trace, observations);

        expect(
          result.nodeMap.get("root-1")?.startTimeSinceParentStart,
        ).toBeNull();
        expect(
          result.nodeMap.get("root-2")?.startTimeSinceParentStart,
        ).toBeNull();
      });

      it("handles TRACE root node properties correctly", () => {
        const trace = createMockTrace({
          id: "trace-1",
          timestamp: new Date("2024-01-01T00:00:00.000Z"),
        });
        const observations: ObservationReturnType[] = [];

        const result = buildTraceUiData(trace, observations);

        expect(result.roots[0].startTimeSinceTrace).toBe(0);
        expect(result.roots[0].startTimeSinceParentStart).toBeNull();
        expect(result.roots[0].depth).toBe(-1);
      });
    });

    describe("Depth Calculation", () => {
      it("assigns depth 0 to root observations", () => {
        const trace = createMockTrace({ id: "trace-1" });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "root-1",
            parentObservationId: null,
          }),
          createMockObservation({
            id: "root-2",
            parentObservationId: null,
          }),
        ];

        const result = buildTraceUiData(trace, observations);

        expect(result.nodeMap.get("root-1")?.depth).toBe(0);
        expect(result.nodeMap.get("root-2")?.depth).toBe(0);
      });

      it("increments depth for nested observations", () => {
        const trace = createMockTrace({ id: "trace-1" });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "level-0",
            parentObservationId: null,
          }),
          createMockObservation({
            id: "level-1",
            parentObservationId: "level-0",
          }),
          createMockObservation({
            id: "level-2",
            parentObservationId: "level-1",
          }),
          createMockObservation({
            id: "level-3",
            parentObservationId: "level-2",
          }),
        ];

        const result = buildTraceUiData(trace, observations);

        expect(result.nodeMap.get("level-0")?.depth).toBe(0);
        expect(result.nodeMap.get("level-1")?.depth).toBe(1);
        expect(result.nodeMap.get("level-2")?.depth).toBe(2);
        expect(result.nodeMap.get("level-3")?.depth).toBe(3);
      });

      it("handles multiple branches with different depths", () => {
        const trace = createMockTrace({ id: "trace-1" });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "root",
            parentObservationId: null,
          }),
          // Branch 1: depth 1 → 2
          createMockObservation({
            id: "branch1-level1",
            parentObservationId: "root",
          }),
          createMockObservation({
            id: "branch1-level2",
            parentObservationId: "branch1-level1",
          }),
          // Branch 2: depth 1 only
          createMockObservation({
            id: "branch2-level1",
            parentObservationId: "root",
          }),
        ];

        const result = buildTraceUiData(trace, observations);

        expect(result.nodeMap.get("root")?.depth).toBe(0);
        expect(result.nodeMap.get("branch1-level1")?.depth).toBe(1);
        expect(result.nodeMap.get("branch1-level2")?.depth).toBe(2);
        expect(result.nodeMap.get("branch2-level1")?.depth).toBe(1);
      });
    });

    describe("Children Depth Calculation", () => {
      it("assigns childrenDepth 0 to leaf nodes", () => {
        const trace = createMockTrace({ id: "trace-1" });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "leaf-1",
            parentObservationId: null,
          }),
          createMockObservation({
            id: "leaf-2",
            parentObservationId: null,
          }),
        ];

        const result = buildTraceUiData(trace, observations);

        expect(result.nodeMap.get("leaf-1")?.childrenDepth).toBe(0);
        expect(result.nodeMap.get("leaf-2")?.childrenDepth).toBe(0);
      });

      it("calculates childrenDepth for linear chain (A → B → C)", () => {
        const trace = createMockTrace({ id: "trace-1" });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "A",
            parentObservationId: null,
          }),
          createMockObservation({
            id: "B",
            parentObservationId: "A",
          }),
          createMockObservation({
            id: "C",
            parentObservationId: "B",
          }),
        ];

        const result = buildTraceUiData(trace, observations);

        // C is leaf: childrenDepth = 0
        expect(result.nodeMap.get("C")?.childrenDepth).toBe(0);
        // B has one child (C): childrenDepth = 1
        expect(result.nodeMap.get("B")?.childrenDepth).toBe(1);
        // A has chain of depth 2: childrenDepth = 2
        expect(result.nodeMap.get("A")?.childrenDepth).toBe(2);
        // Trace root has chain of depth 3: childrenDepth = 3
        expect(result.roots[0].childrenDepth).toBe(3);
      });

      it("calculates childrenDepth for wide tree (parent with 3 children)", () => {
        const trace = createMockTrace({ id: "trace-1" });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "parent",
            parentObservationId: null,
          }),
          createMockObservation({
            id: "child-1",
            parentObservationId: "parent",
          }),
          createMockObservation({
            id: "child-2",
            parentObservationId: "parent",
          }),
          createMockObservation({
            id: "child-3",
            parentObservationId: "parent",
          }),
        ];

        const result = buildTraceUiData(trace, observations);

        // All children are leaves: childrenDepth = 0
        expect(result.nodeMap.get("child-1")?.childrenDepth).toBe(0);
        expect(result.nodeMap.get("child-2")?.childrenDepth).toBe(0);
        expect(result.nodeMap.get("child-3")?.childrenDepth).toBe(0);
        // Parent has children at depth 1: childrenDepth = 1
        expect(result.nodeMap.get("parent")?.childrenDepth).toBe(1);
        // Trace root: childrenDepth = 2
        expect(result.roots[0].childrenDepth).toBe(2);
      });

      it("takes max childrenDepth when branches have different depths", () => {
        const trace = createMockTrace({ id: "trace-1" });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "root",
            parentObservationId: null,
          }),
          // Branch 1: depth 2 (root → branch1 → deep)
          createMockObservation({
            id: "branch1",
            parentObservationId: "root",
          }),
          createMockObservation({
            id: "deep",
            parentObservationId: "branch1",
          }),
          // Branch 2: depth 1 (root → branch2)
          createMockObservation({
            id: "branch2",
            parentObservationId: "root",
          }),
        ];

        const result = buildTraceUiData(trace, observations);

        // deep is leaf: childrenDepth = 0
        expect(result.nodeMap.get("deep")?.childrenDepth).toBe(0);
        // branch1 has one child: childrenDepth = 1
        expect(result.nodeMap.get("branch1")?.childrenDepth).toBe(1);
        // branch2 is leaf: childrenDepth = 0
        expect(result.nodeMap.get("branch2")?.childrenDepth).toBe(0);
        // root takes max(1, 0) + 1 = 2
        expect(result.nodeMap.get("root")?.childrenDepth).toBe(2);
        // Trace root: childrenDepth = 3
        expect(result.roots[0].childrenDepth).toBe(3);
      });

      it("calculates childrenDepth 0 for empty trace", () => {
        const trace = createMockTrace({ id: "trace-1" });
        const observations: ObservationReturnType[] = [];

        const result = buildTraceUiData(trace, observations);

        expect(result.roots[0].childrenDepth).toBe(0);
      });

      it("calculates correct childrenDepth for deep nesting (5+ levels)", () => {
        const trace = createMockTrace({ id: "trace-1" });
        const observations: ObservationReturnType[] = [
          createMockObservation({ id: "L0", parentObservationId: null }),
          createMockObservation({ id: "L1", parentObservationId: "L0" }),
          createMockObservation({ id: "L2", parentObservationId: "L1" }),
          createMockObservation({ id: "L3", parentObservationId: "L2" }),
          createMockObservation({ id: "L4", parentObservationId: "L3" }),
          createMockObservation({ id: "L5", parentObservationId: "L4" }),
          createMockObservation({ id: "L6", parentObservationId: "L5" }),
        ];

        const result = buildTraceUiData(trace, observations);

        // Bottom-up childrenDepth
        expect(result.nodeMap.get("L6")?.childrenDepth).toBe(0);
        expect(result.nodeMap.get("L5")?.childrenDepth).toBe(1);
        expect(result.nodeMap.get("L4")?.childrenDepth).toBe(2);
        expect(result.nodeMap.get("L3")?.childrenDepth).toBe(3);
        expect(result.nodeMap.get("L2")?.childrenDepth).toBe(4);
        expect(result.nodeMap.get("L1")?.childrenDepth).toBe(5);
        expect(result.nodeMap.get("L0")?.childrenDepth).toBe(6);
        // Trace root: 7 levels deep
        expect(result.roots[0].childrenDepth).toBe(7);
      });

      it("calculates childrenDepth with multiple root observations", () => {
        const trace = createMockTrace({ id: "trace-1" });
        const observations: ObservationReturnType[] = [
          // First root with depth 2
          createMockObservation({ id: "root1", parentObservationId: null }),
          createMockObservation({
            id: "root1-child",
            parentObservationId: "root1",
          }),
          createMockObservation({
            id: "root1-grandchild",
            parentObservationId: "root1-child",
          }),
          // Second root with depth 1
          createMockObservation({ id: "root2", parentObservationId: null }),
          createMockObservation({
            id: "root2-child",
            parentObservationId: "root2",
          }),
          // Third root is leaf
          createMockObservation({ id: "root3", parentObservationId: null }),
        ];

        const result = buildTraceUiData(trace, observations);

        // root1 has depth 2, root2 has depth 1, root3 has depth 0
        expect(result.nodeMap.get("root1")?.childrenDepth).toBe(2);
        expect(result.nodeMap.get("root2")?.childrenDepth).toBe(1);
        expect(result.nodeMap.get("root3")?.childrenDepth).toBe(0);
        // Trace root takes max(2, 1, 0) + 1 = 3
        expect(result.roots[0].childrenDepth).toBe(3);
      });
    });

    describe("Edge Cases", () => {
      it("handles observation starting at same time as parent", () => {
        const trace = createMockTrace({
          timestamp: new Date("2024-01-01T00:00:00.000Z"),
        });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "parent",
            parentObservationId: null,
            startTime: new Date("2024-01-01T00:00:01.000Z"),
          }),
          createMockObservation({
            id: "child",
            parentObservationId: "parent",
            startTime: new Date("2024-01-01T00:00:01.000Z"), // Same as parent
          }),
        ];

        const result = buildTraceUiData(trace, observations);
        const child = result.nodeMap.get("child");

        expect(child?.startTimeSinceParentStart).toBe(0);
      });

      it("handles observation starting before trace (clock skew)", () => {
        const trace = createMockTrace({
          timestamp: new Date("2024-01-01T00:00:01.000Z"),
        });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "obs-1",
            parentObservationId: null,
            startTime: new Date("2024-01-01T00:00:00.500Z"), // 500ms before trace
          }),
        ];

        const result = buildTraceUiData(trace, observations);
        const obs1 = result.nodeMap.get("obs-1");

        expect(obs1?.startTimeSinceTrace).toBe(-500);
      });

      it("handles multiple root observations with different start times", () => {
        const trace = createMockTrace({
          timestamp: new Date("2024-01-01T00:00:00.000Z"),
        });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "root-1",
            parentObservationId: null,
            startTime: new Date("2024-01-01T00:00:01.000Z"),
          }),
          createMockObservation({
            id: "root-2",
            parentObservationId: null,
            startTime: new Date("2024-01-01T00:00:05.000Z"),
          }),
          createMockObservation({
            id: "root-3",
            parentObservationId: null,
            startTime: new Date("2024-01-01T00:00:03.500Z"),
          }),
        ];

        const result = buildTraceUiData(trace, observations);

        expect(result.nodeMap.get("root-1")?.startTimeSinceTrace).toBe(1000);
        expect(result.nodeMap.get("root-2")?.startTimeSinceTrace).toBe(5000);
        expect(result.nodeMap.get("root-3")?.startTimeSinceTrace).toBe(3500);

        // All should have null parent-relative time
        expect(
          result.nodeMap.get("root-1")?.startTimeSinceParentStart,
        ).toBeNull();
        expect(
          result.nodeMap.get("root-2")?.startTimeSinceParentStart,
        ).toBeNull();
        expect(
          result.nodeMap.get("root-3")?.startTimeSinceParentStart,
        ).toBeNull();
      });

      it("handles deep nesting without stack overflow", () => {
        const trace = createMockTrace({
          timestamp: new Date("2024-01-01T00:00:00.000Z"),
        });
        const depth = 1000;
        const observations: ObservationReturnType[] = [];

        // Create deep chain: obs-0 → obs-1 → obs-2 → ... → obs-999
        for (let i = 0; i < depth; i++) {
          observations.push(
            createMockObservation({
              id: `obs-${i}`,
              parentObservationId: i === 0 ? null : `obs-${i - 1}`,
              startTime: new Date(
                `2024-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
              ),
            }),
          );
        }

        const result = buildTraceUiData(trace, observations);

        // Verify first, middle, and last nodes
        expect(result.nodeMap.get("obs-0")?.depth).toBe(0);
        expect(result.nodeMap.get("obs-500")?.depth).toBe(500);
        expect(result.nodeMap.get("obs-999")?.depth).toBe(999);

        // Verify temporal calculations still work
        expect(result.nodeMap.get("obs-0")?.startTimeSinceTrace).toBe(0);
        expect(
          result.nodeMap.get("obs-0")?.startTimeSinceParentStart,
        ).toBeNull();
        expect(result.nodeMap.get("obs-1")?.startTimeSinceParentStart).toBe(
          1000,
        );
      });
    });

    describe("Real-World Scenarios", () => {
      it("identifies sequential execution pattern", () => {
        const trace = createMockTrace({
          timestamp: new Date("2024-01-01T00:00:00.000Z"),
        });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "parent",
            parentObservationId: null,
            startTime: new Date("2024-01-01T00:00:00.000Z"),
          }),
          // Sequential children with large delays
          createMockObservation({
            id: "step-1",
            parentObservationId: "parent",
            startTime: new Date("2024-01-01T00:00:01.000Z"), // +1s
          }),
          createMockObservation({
            id: "step-2",
            parentObservationId: "parent",
            startTime: new Date("2024-01-01T00:00:03.000Z"), // +3s
          }),
          createMockObservation({
            id: "step-3",
            parentObservationId: "parent",
            startTime: new Date("2024-01-01T00:00:06.000Z"), // +6s
          }),
        ];

        const result = buildTraceUiData(trace, observations);

        // Sequential pattern: large, increasing parent-relative times
        expect(result.nodeMap.get("step-1")?.startTimeSinceParentStart).toBe(
          1000,
        );
        expect(result.nodeMap.get("step-2")?.startTimeSinceParentStart).toBe(
          3000,
        );
        expect(result.nodeMap.get("step-3")?.startTimeSinceParentStart).toBe(
          6000,
        );
      });

      it("identifies parallel execution pattern", () => {
        const trace = createMockTrace({
          timestamp: new Date("2024-01-01T00:00:00.000Z"),
        });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "parent",
            parentObservationId: null,
            startTime: new Date("2024-01-01T00:00:00.000Z"),
          }),
          // Parallel children with small, similar delays
          createMockObservation({
            id: "parallel-1",
            parentObservationId: "parent",
            startTime: new Date("2024-01-01T00:00:00.050Z"), // +50ms
          }),
          createMockObservation({
            id: "parallel-2",
            parentObservationId: "parent",
            startTime: new Date("2024-01-01T00:00:00.055Z"), // +55ms
          }),
          createMockObservation({
            id: "parallel-3",
            parentObservationId: "parent",
            startTime: new Date("2024-01-01T00:00:00.060Z"), // +60ms
          }),
        ];

        const result = buildTraceUiData(trace, observations);

        // Parallel pattern: small, similar parent-relative times
        expect(
          result.nodeMap.get("parallel-1")?.startTimeSinceParentStart,
        ).toBe(50);
        expect(
          result.nodeMap.get("parallel-2")?.startTimeSinceParentStart,
        ).toBe(55);
        expect(
          result.nodeMap.get("parallel-3")?.startTimeSinceParentStart,
        ).toBe(60);
      });

      it("handles mixed execution patterns", () => {
        const trace = createMockTrace({
          timestamp: new Date("2024-01-01T00:00:00.000Z"),
        });
        const observations: ObservationReturnType[] = [
          createMockObservation({
            id: "root",
            parentObservationId: null,
            startTime: new Date("2024-01-01T00:00:00.000Z"),
          }),
          // First child starts immediately
          createMockObservation({
            id: "immediate",
            parentObservationId: "root",
            startTime: new Date("2024-01-01T00:00:00.010Z"), // +10ms
          }),
          // Second child delayed
          createMockObservation({
            id: "delayed",
            parentObservationId: "root",
            startTime: new Date("2024-01-01T00:00:02.000Z"), // +2s
          }),
          // Nested children under "immediate" - parallel pattern
          createMockObservation({
            id: "nested-1",
            parentObservationId: "immediate",
            startTime: new Date("2024-01-01T00:00:00.100Z"), // +90ms from parent
          }),
          createMockObservation({
            id: "nested-2",
            parentObservationId: "immediate",
            startTime: new Date("2024-01-01T00:00:00.105Z"), // +95ms from parent
          }),
        ];

        const result = buildTraceUiData(trace, observations);

        // Immediate execution
        expect(result.nodeMap.get("immediate")?.startTimeSinceParentStart).toBe(
          10,
        );
        // Delayed execution
        expect(result.nodeMap.get("delayed")?.startTimeSinceParentStart).toBe(
          2000,
        );
        // Nested parallel execution
        expect(result.nodeMap.get("nested-1")?.startTimeSinceParentStart).toBe(
          90,
        );
        expect(result.nodeMap.get("nested-2")?.startTimeSinceParentStart).toBe(
          95,
        );

        // Verify depths
        expect(result.nodeMap.get("root")?.depth).toBe(0);
        expect(result.nodeMap.get("immediate")?.depth).toBe(1);
        expect(result.nodeMap.get("delayed")?.depth).toBe(1);
        expect(result.nodeMap.get("nested-1")?.depth).toBe(2);
        expect(result.nodeMap.get("nested-2")?.depth).toBe(2);
      });
    });
  });
});

describe("removeHiddenNodes", () => {
  const makeNode = (
    overrides: Partial<TreeNode> & { id: string },
  ): TreeNode => ({
    type: "SPAN",
    name: overrides.id,
    startTime: new Date("2024-01-01T00:00:00Z"),
    endTime: new Date("2024-01-01T00:00:01Z"),
    level: "DEFAULT",
    children: [],
    startTimeSinceTrace: 0,
    startTimeSinceParentStart: null,
    depth: 0,
    childrenDepth: 0,
    ...overrides,
  });

  const flattenIds = (nodes: TreeNode[]): Array<[string, string[]]> => {
    const out: Array<[string, string[]]> = [];
    const stack = [...nodes].reverse();

    while (stack.length > 0) {
      const node = stack.pop()!;
      out.push([node.id, node.children.map((c) => c.id)]);
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]!);
      }
    }

    return out;
  };

  it.each([
    {
      name: "keeps nodes unchanged when none are hidden",
      roots: [
        makeNode({
          id: "A",
          children: [makeNode({ id: "B" }), makeNode({ id: "C" })],
        }),
      ],
      expected: [
        ["A", ["B", "C"]],
        ["B", []],
        ["C", []],
      ],
      predicate: () => false,
    },
    {
      name: "promotes children of hidden intermediate nodes",
      roots: [
        makeNode({
          id: "A",
          children: [
            makeNode({
              id: "B",
              level: "DEBUG",
              children: [makeNode({ id: "C" })],
            }),
          ],
        }),
      ],
      expected: [
        ["A", ["C"]],
        ["C", []],
      ],
      predicate: (n: TreeNode) => n.level === "DEBUG",
    },
    {
      name: "promotes children of hidden root nodes",
      roots: [
        makeNode({
          id: "A",
          level: "DEBUG",
          children: [makeNode({ id: "B" }), makeNode({ id: "C" })],
        }),
      ],
      expected: [
        ["B", []],
        ["C", []],
      ],
      predicate: (n: TreeNode) => n.level === "DEBUG",
    },
    {
      name: "handles consecutive hidden ancestors",
      roots: [
        makeNode({
          id: "A",
          children: [
            makeNode({
              id: "B",
              level: "DEBUG",
              children: [
                makeNode({
                  id: "C",
                  level: "DEBUG",
                  children: [makeNode({ id: "D" })],
                }),
              ],
            }),
          ],
        }),
      ],
      expected: [
        ["A", ["D"]],
        ["D", []],
      ],
      predicate: (n: TreeNode) => n.level === "DEBUG",
    },
    {
      name: "merges promoted children with existing siblings",
      roots: [
        makeNode({
          id: "A",
          children: [
            makeNode({
              id: "B",
              level: "DEBUG",
              children: [makeNode({ id: "B1" }), makeNode({ id: "B2" })],
            }),
            makeNode({ id: "C" }),
          ],
        }),
      ],
      expected: [
        ["A", ["B1", "B2", "C"]],
        ["B1", []],
        ["B2", []],
        ["C", []],
      ],
      predicate: (n: TreeNode) => n.level === "DEBUG",
    },
    {
      name: "removes hidden leaf nodes",
      roots: [
        makeNode({
          id: "A",
          children: [
            makeNode({ id: "B", level: "DEBUG" }),
            makeNode({ id: "C" }),
          ],
        }),
      ],
      expected: [
        ["A", ["C"]],
        ["C", []],
      ],
      predicate: (n: TreeNode) => n.level === "DEBUG",
    },
  ])("$name", ({ roots, expected, predicate }) => {
    const result = removeHiddenNodes(roots, predicate);
    expect(flattenIds(result)).toEqual(expected);
  });

  it("does not modify the original tree", () => {
    const child = makeNode({ id: "C" });
    const hidden = makeNode({
      id: "B",
      level: "DEBUG",
      children: [child],
    });
    const root = makeNode({ id: "A", children: [hidden] });

    removeHiddenNodes([root], (n) => n.level === "DEBUG");

    // Original tree is untouched
    expect(root.children).toHaveLength(1);
    expect(root.children[0].id).toBe("B");
    expect(root.children[0].children).toHaveLength(1);
  });

  it("preserves TRACE nodes even if predicate matches", () => {
    const roots = [
      makeNode({
        id: "trace-1",
        type: "TRACE",
        level: "DEBUG",
        children: [makeNode({ id: "obs-1" })],
      }),
    ];

    const result = removeHiddenNodes(
      roots,
      (n) => n.type !== "TRACE" && n.level === "DEBUG",
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("trace-1");
    expect(result[0].children).toHaveLength(1);
  });

  it("handles deeply nested trees without stack overflow", () => {
    const depth = 15_000;
    const root = makeNode({ id: "node-0" });
    let current = root;

    for (let i = 1; i < depth; i++) {
      const child = makeNode({ id: `node-${i}` });
      current.children = [child];
      current = child;
    }

    const result = removeHiddenNodes([root], () => false);

    expect(result).toHaveLength(1);
    let count = 0;
    let cursor: TreeNode | undefined = result[0];
    while (cursor) {
      count++;
      cursor = cursor.children[0];
    }

    expect(count).toBe(depth);
  });
});

describe("getObservationLevels", () => {
  it.each([
    {
      minLevel: undefined,
      expected: ["DEBUG", "DEFAULT", "WARNING", "ERROR"],
    },
    {
      minLevel: "DEFAULT" as const,
      expected: ["DEFAULT", "WARNING", "ERROR"],
    },
    {
      minLevel: "ERROR" as const,
      expected: ["ERROR"],
    },
  ])("returns levels at/above $minLevel", ({ minLevel, expected }) => {
    const levels = getObservationLevels(minLevel);
    expect(levels).toEqual(expected);
  });
});
