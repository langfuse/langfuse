/**
 * Tests for tree-building utilities.
 *
 * Run with: pnpm test-client --testPathPattern="tree-building"
 */

import { buildTraceUiData } from "./tree-building";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";

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
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  level: "DEFAULT",
  statusMessage: null,
  version: null,
  model: null,
  modelParameters: null,
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  unit: null,
  inputCost: null,
  outputCost: null,
  totalCost: null,
  completionStartTime: null,
  timeToFirstToken: null,
  promptId: null,
  modelId: null,
  inputUsage: null,
  outputUsage: null,
  totalUsage: null,
  costDetails: null,
  calculatedInputCost: null,
  calculatedOutputCost: null,
  calculatedTotalCost: null,
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
});
