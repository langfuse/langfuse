// No test dependencies from shared
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
    name: "mock-name",
    type: "SPAN",
    startTime: new Date("2025-08-21T18:53:25.571Z"),
    endTime: new Date("2025-08-21T18:53:25.587Z"),
    parentObservationId: null,
    traceId: "trace-1",
    level: "DEFAULT",
    statusMessage: null,
    version: null,
    projectId: "project-1",
    createdAt: new Date("2025-08-21T18:53:25.571Z"),
    updatedAt: new Date("2025-08-21T18:53:25.571Z"),
    model: null,
    modelParameters: null,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    unit: null,
    inputUsage: null,
    outputUsage: null,
    totalUsage: null,
    inputCost: null,
    outputCost: null,
    totalCost: null,
    calculatedInputCost: null,
    calculatedOutputCost: null,
    calculatedTotalCost: null,
    promptId: null,
    promptName: null,
    promptVersion: null,
    ...overrides,
  });

  describe("basic functionality", () => {
    it("should return empty array for empty input", () => {
      const result = nestObservations([]);
      expect(result.nestedObservations).toEqual([]);
      expect(result.hiddenObservationsCount).toBe(0);
    });

    it("should return single observation as root when no parent", () => {
      const obs = createMockObservation({
        id: "obs1",
        name: "root observation",
      });

      const result = nestObservations([obs]);

      expect(result.nestedObservations).toHaveLength(1);
      expect(result.nestedObservations[0]).toMatchObject({
        id: "obs1",
        name: "root observation",
        children: [],
      });
      expect(result.hiddenObservationsCount).toBe(0);
    });

    it("should return multiple root observations when no parents", () => {
      const obs1 = createMockObservation({
        id: "obs1",
        name: "root 1",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const obs2 = createMockObservation({
        id: "obs2",
        name: "root 2",
        startTime: new Date("2025-08-21T18:53:26.000Z"),
      });

      const result = nestObservations([obs1, obs2]);

      expect(result.nestedObservations).toHaveLength(2);
      expect(result.nestedObservations[0].id).toBe("obs1");
      expect(result.nestedObservations[1].id).toBe("obs2");
      expect(result.hiddenObservationsCount).toBe(0);
    });
  });

  describe("parent-child relationships", () => {
    it("should nest child observation under parent", () => {
      const parent = createMockObservation({
        id: "parent",
        name: "parent observation",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const child = createMockObservation({
        id: "child",
        name: "child observation",
        parentObservationId: "parent",
        startTime: new Date("2025-08-21T18:53:25.100Z"),
      });

      const result = nestObservations([parent, child]);

      expect(result.nestedObservations).toHaveLength(1);
      expect(result.nestedObservations[0].id).toBe("parent");
      expect(result.nestedObservations[0].children).toHaveLength(1);
      expect(result.nestedObservations[0].children[0]).toMatchObject({
        id: "child",
        name: "child observation",
        children: [],
      });
    });

    it("should handle multiple children under same parent", () => {
      const parent = createMockObservation({
        id: "parent",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const child1 = createMockObservation({
        id: "child1",
        parentObservationId: "parent",
        startTime: new Date("2025-08-21T18:53:25.100Z"),
      });
      const child2 = createMockObservation({
        id: "child2",
        parentObservationId: "parent",
        startTime: new Date("2025-08-21T18:53:25.200Z"),
      });

      const result = nestObservations([parent, child1, child2]);

      expect(result.nestedObservations).toHaveLength(1);
      expect(result.nestedObservations[0].children).toHaveLength(2);
      expect(result.nestedObservations[0].children[0].id).toBe("child1");
      expect(result.nestedObservations[0].children[1].id).toBe("child2");
    });

    it("should handle deeply nested observations", () => {
      const root = createMockObservation({
        id: "root",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const child = createMockObservation({
        id: "child",
        parentObservationId: "root",
        startTime: new Date("2025-08-21T18:53:25.100Z"),
      });
      const grandchild = createMockObservation({
        id: "grandchild",
        parentObservationId: "child",
        startTime: new Date("2025-08-21T18:53:25.200Z"),
      });
      const greatGrandchild = createMockObservation({
        id: "greatGrandchild",
        parentObservationId: "grandchild",
        startTime: new Date("2025-08-21T18:53:25.300Z"),
      });

      const result = nestObservations([
        root,
        child,
        grandchild,
        greatGrandchild,
      ]);

      expect(result.nestedObservations).toHaveLength(1);
      expect(result.nestedObservations[0].id).toBe("root");
      expect(result.nestedObservations[0].children).toHaveLength(1);
      expect(result.nestedObservations[0].children[0].id).toBe("child");
      expect(result.nestedObservations[0].children[0].children).toHaveLength(1);
      expect(result.nestedObservations[0].children[0].children[0].id).toBe(
        "grandchild",
      );
      expect(
        result.nestedObservations[0].children[0].children[0].children,
      ).toHaveLength(1);
      expect(
        result.nestedObservations[0].children[0].children[0].children[0].id,
      ).toBe("greatGrandchild");
    });
  });

  describe("sorting by start time", () => {
    it("should sort root observations by start time", () => {
      const obs3 = createMockObservation({
        id: "obs3",
        startTime: new Date("2025-08-21T18:53:27.000Z"),
      });
      const obs1 = createMockObservation({
        id: "obs1",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const obs2 = createMockObservation({
        id: "obs2",
        startTime: new Date("2025-08-21T18:53:26.000Z"),
      });

      // Pass in unsorted order
      const result = nestObservations([obs3, obs1, obs2]);

      expect(result.nestedObservations).toHaveLength(3);
      expect(result.nestedObservations[0].id).toBe("obs1");
      expect(result.nestedObservations[1].id).toBe("obs2");
      expect(result.nestedObservations[2].id).toBe("obs3");
    });

    it("should sort children by start time", () => {
      const parent = createMockObservation({
        id: "parent",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const child3 = createMockObservation({
        id: "child3",
        parentObservationId: "parent",
        startTime: new Date("2025-08-21T18:53:25.300Z"),
      });
      const child1 = createMockObservation({
        id: "child1",
        parentObservationId: "parent",
        startTime: new Date("2025-08-21T18:53:25.100Z"),
      });
      const child2 = createMockObservation({
        id: "child2",
        parentObservationId: "parent",
        startTime: new Date("2025-08-21T18:53:25.200Z"),
      });

      // Pass in unsorted order
      const result = nestObservations([parent, child3, child1, child2]);

      expect(result.nestedObservations[0].children).toHaveLength(3);
      expect(result.nestedObservations[0].children[0].id).toBe("child1");
      expect(result.nestedObservations[0].children[1].id).toBe("child2");
      expect(result.nestedObservations[0].children[2].id).toBe("child3");
    });
  });

  describe("orphaned observations", () => {
    it("should handle observation with non-existent parent as root", () => {
      const orphan = createMockObservation({
        id: "orphan",
        name: "orphaned observation",
        parentObservationId: "non-existent-parent",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });

      const result = nestObservations([orphan]);

      expect(result.nestedObservations).toHaveLength(1);
      expect(result.nestedObservations[0]).toMatchObject({
        id: "orphan",
        name: "orphaned observation",
        parentObservationId: null, // Should be cleared
        children: [],
      });
    });

    it("should handle multiple orphaned observations", () => {
      const orphan1 = createMockObservation({
        id: "orphan1",
        parentObservationId: "missing-parent-1",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const orphan2 = createMockObservation({
        id: "orphan2",
        parentObservationId: "missing-parent-2",
        startTime: new Date("2025-08-21T18:53:26.000Z"),
      });

      const result = nestObservations([orphan1, orphan2]);

      expect(result.nestedObservations).toHaveLength(2);
      expect(result.nestedObservations[0].parentObservationId).toBe(null);
      expect(result.nestedObservations[1].parentObservationId).toBe(null);
    });

    it("should handle mix of valid and orphaned observations", () => {
      const parent = createMockObservation({
        id: "parent",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const validChild = createMockObservation({
        id: "validChild",
        parentObservationId: "parent",
        startTime: new Date("2025-08-21T18:53:25.100Z"),
      });
      const orphan = createMockObservation({
        id: "orphan",
        parentObservationId: "missing-parent",
        startTime: new Date("2025-08-21T18:53:25.200Z"),
      });

      const result = nestObservations([parent, validChild, orphan]);

      expect(result.nestedObservations).toHaveLength(2);
      // Parent with valid child
      expect(result.nestedObservations[0].id).toBe("parent");
      expect(result.nestedObservations[0].children).toHaveLength(1);
      expect(result.nestedObservations[0].children[0].id).toBe("validChild");
      // Orphan as separate root
      expect(result.nestedObservations[1].id).toBe("orphan");
      expect(result.nestedObservations[1].parentObservationId).toBe(null);
    });
  });

  describe("observation level filtering", () => {
    it("should include all observations when no minLevel specified", () => {
      const debug = createMockObservation({
        id: "debug",
        level: "DEBUG",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const defaultObs = createMockObservation({
        id: "default",
        level: "DEFAULT",
        startTime: new Date("2025-08-21T18:53:25.100Z"),
      });
      const warning = createMockObservation({
        id: "warning",
        level: "WARNING",
        startTime: new Date("2025-08-21T18:53:25.200Z"),
      });
      const error = createMockObservation({
        id: "error",
        level: "ERROR",
        startTime: new Date("2025-08-21T18:53:25.300Z"),
      });

      const result = nestObservations([debug, defaultObs, warning, error]);

      expect(result.nestedObservations).toHaveLength(4);
      expect(result.hiddenObservationsCount).toBe(0);
    });

    it("should filter observations below DEFAULT level", () => {
      const debug = createMockObservation({
        id: "debug",
        level: "DEBUG",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const defaultObs = createMockObservation({
        id: "default",
        level: "DEFAULT",
        startTime: new Date("2025-08-21T18:53:25.100Z"),
      });
      const warning = createMockObservation({
        id: "warning",
        level: "WARNING",
        startTime: new Date("2025-08-21T18:53:25.200Z"),
      });

      const result = nestObservations([debug, defaultObs, warning], "DEFAULT");

      expect(result.nestedObservations).toHaveLength(2);
      expect(result.nestedObservations[0].id).toBe("default");
      expect(result.nestedObservations[1].id).toBe("warning");
      expect(result.hiddenObservationsCount).toBe(1);
    });

    it("should filter observations below WARNING level", () => {
      const debug = createMockObservation({
        id: "debug",
        level: "DEBUG",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const defaultObs = createMockObservation({
        id: "default",
        level: "DEFAULT",
        startTime: new Date("2025-08-21T18:53:25.100Z"),
      });
      const warning = createMockObservation({
        id: "warning",
        level: "WARNING",
        startTime: new Date("2025-08-21T18:53:25.200Z"),
      });
      const error = createMockObservation({
        id: "error",
        level: "ERROR",
        startTime: new Date("2025-08-21T18:53:25.300Z"),
      });

      const result = nestObservations(
        [debug, defaultObs, warning, error],
        "WARNING",
      );

      expect(result.nestedObservations).toHaveLength(2);
      expect(result.nestedObservations[0].id).toBe("warning");
      expect(result.nestedObservations[1].id).toBe("error");
      expect(result.hiddenObservationsCount).toBe(2);
    });

    it("should only include ERROR level observations", () => {
      const debug = createMockObservation({
        id: "debug",
        level: "DEBUG",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const defaultObs = createMockObservation({
        id: "default",
        level: "DEFAULT",
        startTime: new Date("2025-08-21T18:53:25.100Z"),
      });
      const error = createMockObservation({
        id: "error",
        level: "ERROR",
        startTime: new Date("2025-08-21T18:53:25.200Z"),
      });

      const result = nestObservations([debug, defaultObs, error], "ERROR");

      expect(result.nestedObservations).toHaveLength(1);
      expect(result.nestedObservations[0].id).toBe("error");
      expect(result.hiddenObservationsCount).toBe(2);
    });

    it("should handle parent filtered out but child included", () => {
      const debugParent = createMockObservation({
        id: "debugParent",
        level: "DEBUG",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const errorChild = createMockObservation({
        id: "errorChild",
        level: "ERROR",
        parentObservationId: "debugParent",
        startTime: new Date("2025-08-21T18:53:25.100Z"),
      });

      const result = nestObservations([debugParent, errorChild], "ERROR");

      // Child should become a root since parent is filtered out
      expect(result.nestedObservations).toHaveLength(1);
      expect(result.nestedObservations[0].id).toBe("errorChild");
      expect(result.nestedObservations[0].parentObservationId).toBe(null);
      expect(result.hiddenObservationsCount).toBe(1);
    });
  });

  describe("complex scenarios", () => {
    it("should handle complex tree with multiple levels and branches", () => {
      const root1 = createMockObservation({
        id: "root1",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const root1Child1 = createMockObservation({
        id: "root1Child1",
        parentObservationId: "root1",
        startTime: new Date("2025-08-21T18:53:25.100Z"),
      });
      const root1Child2 = createMockObservation({
        id: "root1Child2",
        parentObservationId: "root1",
        startTime: new Date("2025-08-21T18:53:25.200Z"),
      });
      const root1Grandchild = createMockObservation({
        id: "root1Grandchild",
        parentObservationId: "root1Child1",
        startTime: new Date("2025-08-21T18:53:25.150Z"),
      });
      const root2 = createMockObservation({
        id: "root2",
        startTime: new Date("2025-08-21T18:53:26.000Z"),
      });
      const root2Child = createMockObservation({
        id: "root2Child",
        parentObservationId: "root2",
        startTime: new Date("2025-08-21T18:53:26.100Z"),
      });

      const result = nestObservations([
        root1,
        root1Child1,
        root1Child2,
        root1Grandchild,
        root2,
        root2Child,
      ]);

      expect(result.nestedObservations).toHaveLength(2);

      // Verify root1 structure
      const root1Result = result.nestedObservations[0];
      expect(root1Result.id).toBe("root1");
      expect(root1Result.children).toHaveLength(2);
      expect(root1Result.children[0].id).toBe("root1Child1");
      expect(root1Result.children[0].children).toHaveLength(1);
      expect(root1Result.children[0].children[0].id).toBe("root1Grandchild");
      expect(root1Result.children[1].id).toBe("root1Child2");

      // Verify root2 structure
      const root2Result = result.nestedObservations[1];
      expect(root2Result.id).toBe("root2");
      expect(root2Result.children).toHaveLength(1);
      expect(root2Result.children[0].id).toBe("root2Child");
    });

    it("should handle observations passed in random order", () => {
      const root = createMockObservation({
        id: "root",
        startTime: new Date("2025-08-21T18:53:25.000Z"),
      });
      const grandchild = createMockObservation({
        id: "grandchild",
        parentObservationId: "child",
        startTime: new Date("2025-08-21T18:53:25.200Z"),
      });
      const child = createMockObservation({
        id: "child",
        parentObservationId: "root",
        startTime: new Date("2025-08-21T18:53:25.100Z"),
      });

      // Pass in reverse order
      const result = nestObservations([grandchild, child, root]);

      expect(result.nestedObservations).toHaveLength(1);
      expect(result.nestedObservations[0].id).toBe("root");
      expect(result.nestedObservations[0].children).toHaveLength(1);
      expect(result.nestedObservations[0].children[0].id).toBe("child");
      expect(result.nestedObservations[0].children[0].children).toHaveLength(1);
      expect(result.nestedObservations[0].children[0].children[0].id).toBe(
        "grandchild",
      );
    });

    it("should preserve observation properties during nesting", () => {
      const parent = createMockObservation({
        id: "parent",
        name: "Parent Observation",
        type: "GENERATION",
        level: "DEFAULT",
        traceId: "trace-123",
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        startTime: new Date("2025-08-21T18:53:25.000Z"),
        endTime: new Date("2025-08-21T18:53:25.500Z"),
      });

      const result = nestObservations([parent]);

      const resultObs = result.nestedObservations[0];
      expect(resultObs.name).toBe("Parent Observation");
      expect(resultObs.type).toBe("GENERATION");
      expect(resultObs.level).toBe("DEFAULT");
      expect(resultObs.traceId).toBe("trace-123");
      expect(resultObs.promptTokens).toBe(100);
      expect(resultObs.completionTokens).toBe(50);
      expect(resultObs.totalTokens).toBe(150);
    });
  });
});
