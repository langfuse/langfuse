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

  it("should build a nested tree from flat observations with parent-child relationships", () => {
    // Create a flat list of observations representing this tree structure:
    // parent1 (root)
    //   ├─ child1-1
    //   └─ child1-2
    //       └─ grandchild1-2-1
    // parent2 (root)
    const observations: ObservationReturnType[] = [
      createMockObservation({
        id: "parent1",
        name: "Parent 1",
        parentObservationId: null,
        startTime: new Date("2024-01-01T00:00:00.000Z"),
      }),
      createMockObservation({
        id: "child1-1",
        name: "Child 1-1",
        parentObservationId: "parent1",
        startTime: new Date("2024-01-01T00:00:01.000Z"),
      }),
      createMockObservation({
        id: "child1-2",
        name: "Child 1-2",
        parentObservationId: "parent1",
        startTime: new Date("2024-01-01T00:00:02.000Z"),
      }),
      createMockObservation({
        id: "grandchild1-2-1",
        name: "Grandchild 1-2-1",
        parentObservationId: "child1-2",
        startTime: new Date("2024-01-01T00:00:03.000Z"),
      }),
      createMockObservation({
        id: "parent2",
        name: "Parent 2",
        parentObservationId: null,
        startTime: new Date("2024-01-01T00:00:04.000Z"),
      }),
    ];

    const result = nestObservations(observations);

    // Should have 2 root observations
    expect(result.nestedObservations).toHaveLength(2);
    expect(result.hiddenObservationsCount).toBe(0);

    // Check first root (parent1) and its children
    const parent1 = result.nestedObservations.find((o) => o.id === "parent1");
    expect(parent1).toBeDefined();
    expect(parent1?.children).toHaveLength(2);
    expect(parent1?.children[0].id).toBe("child1-1");
    expect(parent1?.children[1].id).toBe("child1-2");

    // Check nested grandchild
    const child12 = parent1?.children[1];
    expect(child12?.children).toHaveLength(1);
    expect(child12?.children[0].id).toBe("grandchild1-2-1");

    // Check second root (parent2) has no children
    const parent2 = result.nestedObservations.find((o) => o.id === "parent2");
    expect(parent2).toBeDefined();
    expect(parent2?.children).toHaveLength(0);
  });
});
