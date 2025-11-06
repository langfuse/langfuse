// Mock shared dependencies
jest.mock("@langfuse/shared", () => ({
  ObservationLevel: {
    DEBUG: "DEBUG",
    DEFAULT: "DEFAULT",
    WARNING: "WARNING",
    ERROR: "ERROR",
  },
}));

import { nestObservations } from "@/src/components/trace/lib/helpers";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";

describe("nestObservations", () => {
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

  it("should nest observations with parent-child relationships", () => {
    // Create a flat list of observations with parent-child relationships:
    // parent1
    //   ├─ child1
    //   └─ child2
    // parent2
    const observations: ObservationReturnType[] = [
      createMockObservation({
        id: "parent1",
        name: "Parent 1",
        parentObservationId: null,
        startTime: new Date("2024-01-01T00:00:00.000Z"),
      }),
      createMockObservation({
        id: "child1",
        name: "Child 1",
        parentObservationId: "parent1",
        startTime: new Date("2024-01-01T00:00:01.000Z"),
      }),
      createMockObservation({
        id: "child2",
        name: "Child 2",
        parentObservationId: "parent1",
        startTime: new Date("2024-01-01T00:00:02.000Z"),
      }),
      createMockObservation({
        id: "parent2",
        name: "Parent 2",
        parentObservationId: null,
        startTime: new Date("2024-01-01T00:00:03.000Z"),
      }),
    ];

    const result = nestObservations(observations);

    // Should have 2 root observations
    expect(result.nestedObservations).toHaveLength(2);
    expect(result.hiddenObservationsCount).toBe(0);

    // Check first root (parent1)
    const parent1 = result.nestedObservations.find((o) => o.id === "parent1");
    expect(parent1).toBeDefined();
    expect(parent1?.children).toHaveLength(2);
    expect(parent1?.children[0].id).toBe("child1");
    expect(parent1?.children[1].id).toBe("child2");

    // Check second root (parent2)
    const parent2 = result.nestedObservations.find((o) => o.id === "parent2");
    expect(parent2).toBeDefined();
    expect(parent2?.children).toHaveLength(0);
  });

  it("should sort observations by start time", () => {
    // Create observations with out-of-order start times
    const observations: ObservationReturnType[] = [
      createMockObservation({
        id: "obs3",
        name: "Third",
        startTime: new Date("2024-01-01T00:00:03.000Z"),
      }),
      createMockObservation({
        id: "obs1",
        name: "First",
        startTime: new Date("2024-01-01T00:00:01.000Z"),
      }),
      createMockObservation({
        id: "obs2",
        name: "Second",
        startTime: new Date("2024-01-01T00:00:02.000Z"),
      }),
    ];

    const result = nestObservations(observations);

    // Should be sorted by start time
    expect(result.nestedObservations[0].id).toBe("obs1");
    expect(result.nestedObservations[1].id).toBe("obs2");
    expect(result.nestedObservations[2].id).toBe("obs3");
  });

  it("should handle deeply nested observations", () => {
    // Create a deeply nested structure:
    // root
    //   └─ level1
    //       └─ level2
    //           └─ level3
    const observations: ObservationReturnType[] = [
      createMockObservation({
        id: "root",
        name: "Root",
        parentObservationId: null,
        startTime: new Date("2024-01-01T00:00:00.000Z"),
      }),
      createMockObservation({
        id: "level1",
        name: "Level 1",
        parentObservationId: "root",
        startTime: new Date("2024-01-01T00:00:01.000Z"),
      }),
      createMockObservation({
        id: "level2",
        name: "Level 2",
        parentObservationId: "level1",
        startTime: new Date("2024-01-01T00:00:02.000Z"),
      }),
      createMockObservation({
        id: "level3",
        name: "Level 3",
        parentObservationId: "level2",
        startTime: new Date("2024-01-01T00:00:03.000Z"),
      }),
    ];

    const result = nestObservations(observations);

    // Should have 1 root
    expect(result.nestedObservations).toHaveLength(1);

    // Navigate down the tree
    const root = result.nestedObservations[0];
    expect(root.id).toBe("root");
    expect(root.children).toHaveLength(1);

    const level1 = root.children[0];
    expect(level1.id).toBe("level1");
    expect(level1.children).toHaveLength(1);

    const level2 = level1.children[0];
    expect(level2.id).toBe("level2");
    expect(level2.children).toHaveLength(1);

    const level3 = level2.children[0];
    expect(level3.id).toBe("level3");
    expect(level3.children).toHaveLength(0);
  });

  it("should handle empty observation list", () => {
    const result = nestObservations([]);

    expect(result.nestedObservations).toHaveLength(0);
    expect(result.hiddenObservationsCount).toBe(0);
  });

  it("should remove parent references when parent does not exist", () => {
    // Create an observation with a parent that doesn't exist
    const observations: ObservationReturnType[] = [
      createMockObservation({
        id: "orphan",
        name: "Orphan",
        parentObservationId: "non-existent-parent",
        startTime: new Date("2024-01-01T00:00:00.000Z"),
      }),
    ];

    const result = nestObservations(observations);

    // Should be treated as a root observation
    expect(result.nestedObservations).toHaveLength(1);
    expect(result.nestedObservations[0].id).toBe("orphan");
    expect(result.nestedObservations[0].parentObservationId).toBeNull();
  });

  it("should filter observations by minimum level", () => {
    const observations: ObservationReturnType[] = [
      createMockObservation({
        id: "debug-obs",
        name: "Debug",
        level: "DEBUG",
        startTime: new Date("2024-01-01T00:00:00.000Z"),
      }),
      createMockObservation({
        id: "default-obs",
        name: "Default",
        level: "DEFAULT",
        startTime: new Date("2024-01-01T00:00:01.000Z"),
      }),
      createMockObservation({
        id: "warning-obs",
        name: "Warning",
        level: "WARNING",
        startTime: new Date("2024-01-01T00:00:02.000Z"),
      }),
      createMockObservation({
        id: "error-obs",
        name: "Error",
        level: "ERROR",
        startTime: new Date("2024-01-01T00:00:03.000Z"),
      }),
    ];

    // Filter with WARNING as minimum level
    const result = nestObservations(observations, "WARNING");

    // Should only include WARNING and ERROR observations
    expect(result.nestedObservations).toHaveLength(2);
    expect(result.nestedObservations[0].id).toBe("warning-obs");
    expect(result.nestedObservations[1].id).toBe("error-obs");
    expect(result.hiddenObservationsCount).toBe(2); // DEBUG and DEFAULT are hidden
  });

  it("should sort children by start time within each parent", () => {
    const observations: ObservationReturnType[] = [
      createMockObservation({
        id: "parent",
        name: "Parent",
        parentObservationId: null,
        startTime: new Date("2024-01-01T00:00:00.000Z"),
      }),
      createMockObservation({
        id: "child3",
        name: "Child 3",
        parentObservationId: "parent",
        startTime: new Date("2024-01-01T00:00:03.000Z"),
      }),
      createMockObservation({
        id: "child1",
        name: "Child 1",
        parentObservationId: "parent",
        startTime: new Date("2024-01-01T00:00:01.000Z"),
      }),
      createMockObservation({
        id: "child2",
        name: "Child 2",
        parentObservationId: "parent",
        startTime: new Date("2024-01-01T00:00:02.000Z"),
      }),
    ];

    const result = nestObservations(observations);

    const parent = result.nestedObservations[0];
    expect(parent.children).toHaveLength(3);
    expect(parent.children[0].id).toBe("child1");
    expect(parent.children[1].id).toBe("child2");
    expect(parent.children[2].id).toBe("child3");
  });
});
