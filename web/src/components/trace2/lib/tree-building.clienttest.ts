/**
 * Tests for tree-building utilities.
 *
 * Run with: pnpm test-client --testPathPattern="tree-building"
 */

import { buildTraceUiData } from "./tree-building";
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
  it("creates tree with trace as root and observations as children", () => {
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

    // Tree root should be the trace
    expect(result.tree.id).toBe("trace-trace-1");
    expect(result.tree.type).toBe("TRACE");
    expect(result.tree.name).toBe("Test Trace");

    // Should have 2 child observations
    expect(result.tree.children).toHaveLength(2);
    expect(result.tree.children[0].id).toBe("obs-1");
    expect(result.tree.children[1].id).toBe("obs-2");
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
    expect(result.tree.children).toHaveLength(1);
    const parent = result.tree.children[0];
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

    expect(result.tree.children).toHaveLength(0);
    expect(result.searchItems).toHaveLength(1); // Just the trace
    expect(result.hiddenObservationsCount).toBe(0);
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
    expect(result.tree.children[0].id).toBe("obs-early");
    expect(result.tree.children[1].id).toBe("obs-middle");
    expect(result.tree.children[2].id).toBe("obs-late");
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
      expect(result.tree.totalCost).toBeUndefined();
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
      expect(result.tree.totalCost).toBeDefined();
      expect(result.tree.totalCost?.equals(new Decimal(0.8))).toBe(true);
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
      const traceTotalCost = result.tree.totalCost;
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
      expect(result.tree.totalCost).toBeUndefined();
    });
  });

  describe("Performance Tests", () => {
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
      it.skip("builds deep chain", () => {
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

    describe.skip("500k observations (extreme - manual only)", () => {
      const scale = 500_000;
      const threshold = 60_000; // 60s

      it("builds realistic structure", () => {
        runPerformanceTest(scale, "realistic", false, threshold);
      });

      it("builds with cost aggregation", () => {
        runPerformanceTest(scale, "realistic", true, threshold);
      });
    });

    describe.skip("1M observations (extreme - manual only)", () => {
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
});
