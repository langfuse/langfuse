// No test dependencies from shared
jest.mock("@langfuse/shared", () => ({
  ObservationType: {
    SPAN: "SPAN",
    EVENT: "EVENT",
    GENERATION: "GENERATION",
    AGENT: "AGENT",
    TOOL: "TOOL",
    CHAIN: "CHAIN",
    RETRIEVER: "RETRIEVER",
    EVALUATOR: "EVALUATOR",
    EMBEDDING: "EMBEDDING",
    GUARDRAIL: "GUARDRAIL",
  },
}));

import { buildStepData } from "@/src/features/trace-graph-view/buildStepData";
import { type AgentGraphDataResponse } from "@/src/features/trace-graph-view/types";

describe("buildStepData", () => {
  const createMockObservation = (
    overrides: Partial<AgentGraphDataResponse> = {},
  ): AgentGraphDataResponse => ({
    id: "mock-id",
    name: "mock-name",
    node: null,
    step: null,
    parentObservationId: null,
    startTime: "2025-08-21 18:53:25.571",
    endTime: "2025-08-21 18:53:25.587",
    observationType: "AGENT",
    ...overrides,
  });

  describe("basic sequential timing", () => {
    it("should put sequential observations in different steps", () => {
      const observations: AgentGraphDataResponse[] = [
        createMockObservation({
          id: "obs1",
          name: "first",
          startTime: "2025-08-21 18:53:25.000",
          endTime: "2025-08-21 18:53:25.100",
        }),
        createMockObservation({
          id: "obs2",
          name: "second",
          startTime: "2025-08-21 18:53:25.200", // Starts after first ends
          endTime: "2025-08-21 18:53:25.300",
        }),
      ];

      const result = buildStepData(observations);

      // Remove system nodes for easier testing
      const userObservations = result.filter((obs) => !obs.name.includes("__"));

      expect(userObservations).toHaveLength(2);

      const first = userObservations.find((obs) => obs.name === "first");
      const second = userObservations.find((obs) => obs.name === "second");

      expect(first?.step).toBe(1);
      expect(second?.step).toBe(2);
    });
  });

  describe("overlapping observations", () => {
    it("should put overlapping observations in same step", () => {
      const observations: AgentGraphDataResponse[] = [
        createMockObservation({
          id: "obs1",
          name: "first",
          startTime: "2025-08-21 18:53:25.000",
          endTime: "2025-08-21 18:53:25.200",
        }),
        createMockObservation({
          id: "obs2",
          name: "second",
          startTime: "2025-08-21 18:53:25.100", // Starts before first ends
          endTime: "2025-08-21 18:53:25.300",
        }),
      ];

      const result = buildStepData(observations);

      const userObservations = result.filter((obs) => !obs.name.includes("__"));

      expect(userObservations).toHaveLength(2);

      const first = userObservations.find((obs) => obs.name === "first");
      const second = userObservations.find((obs) => obs.name === "second");

      expect(first?.step).toBe(1);
      expect(second?.step).toBe(1); // Same step due to overlap
    });

    it("should handle multiple parallel observations in same step", () => {
      const observations: AgentGraphDataResponse[] = [
        createMockObservation({
          id: "obs1",
          name: "first",
          startTime: "2025-08-21 18:53:25.000",
          endTime: "2025-08-21 18:53:25.300",
        }),
        createMockObservation({
          id: "obs2",
          name: "second",
          startTime: "2025-08-21 18:53:25.050", // Overlaps with first
          endTime: "2025-08-21 18:53:25.250",
        }),
        createMockObservation({
          id: "obs3",
          name: "third",
          startTime: "2025-08-21 18:53:25.150", // Overlaps with both first and second
          endTime: "2025-08-21 18:53:25.400",
        }),
        createMockObservation({
          id: "obs4",
          name: "fourth",
          startTime: "2025-08-21 18:53:25.500", // Starts after all others end - should be step 2
          endTime: "2025-08-21 18:53:25.600",
        }),
      ];

      const result = buildStepData(observations);

      const userObservations = result.filter((obs) => !obs.name.includes("__"));
      expect(userObservations).toHaveLength(4);

      const first = userObservations.find((obs) => obs.name === "first");
      const second = userObservations.find((obs) => obs.name === "second");
      const third = userObservations.find((obs) => obs.name === "third");
      const fourth = userObservations.find((obs) => obs.name === "fourth");

      // First three should all be in step 1 (parallel execution)
      expect(first?.step).toBe(1);
      expect(second?.step).toBe(1);
      expect(third?.step).toBe(1);

      // Fourth starts after all others end, so step 2 (sequential)
      expect(fourth?.step).toBe(2);
    });

    it("should handle complex cleanup scenario - observation added then kicked out", () => {
      const observations: AgentGraphDataResponse[] = [
        createMockObservation({
          id: "obs1",
          name: "long_task",
          startTime: "2025-08-21 18:53:25.000",
          endTime: "2025-08-21 18:53:25.500", // Long running task
        }),
        createMockObservation({
          id: "obs2",
          name: "short_overlap",
          startTime: "2025-08-21 18:53:25.100", // Starts before long_task ends (gets added to group)
          endTime: "2025-08-21 18:53:25.150", // But ends early
        }),
        createMockObservation({
          id: "obs3",
          name: "late_start",
          startTime: "2025-08-21 18:53:25.200", // Starts after short_overlap ends (gets kicked out during cleanup)
          endTime: "2025-08-21 18:53:25.300",
        }),
        createMockObservation({
          id: "obs4",
          name: "independent",
          startTime: "2025-08-21 18:53:25.600", // Completely separate, should be step 3
          endTime: "2025-08-21 18:53:25.700",
        }),
      ];

      const result = buildStepData(observations);

      const userObservations = result.filter((obs) => !obs.name.includes("__"));
      expect(userObservations).toHaveLength(4);

      const longTask = userObservations.find((obs) => obs.name === "long_task");
      const shortOverlap = userObservations.find(
        (obs) => obs.name === "short_overlap",
      );
      const lateStart = userObservations.find(
        (obs) => obs.name === "late_start",
      );
      const independent = userObservations.find(
        (obs) => obs.name === "independent",
      );

      // Expected behavior:
      // Step 1: long_task, short_overlap (they overlap)
      // late_start initially gets added because it starts before long_task ends (200 < 500)
      // BUT during cleanup, late_start gets kicked out because it starts after short_overlap ends (200 >= 150)
      // Step 2: late_start (processed in recursive call)
      // Step 3: independent (completely separate)

      expect(longTask?.step).toBe(1);
      expect(shortOverlap?.step).toBe(1); // Overlaps with long_task
      expect(lateStart?.step).toBe(2); // Kicked out during cleanup, processed recursively
      expect(independent?.step).toBe(3); // Sequential after everything else
    });
  });

  describe("parent-child constraints", () => {
    it("should enforce parent-child step ordering", () => {
      const observations: AgentGraphDataResponse[] = [
        createMockObservation({
          id: "parent",
          name: "parent_task",
          startTime: "2025-08-21 18:53:25.000",
          endTime: "2025-08-21 18:53:25.100",
          parentObservationId: null,
        }),
        createMockObservation({
          id: "child",
          name: "child_task",
          startTime: "2025-08-21 18:53:25.050", // Overlaps with parent
          endTime: "2025-08-21 18:53:25.150",
          parentObservationId: "parent",
        }),
      ];

      const result = buildStepData(observations);

      const userObservations = result.filter((obs) => !obs.name.includes("__"));

      const parent = userObservations.find((obs) => obs.name === "parent_task");
      const child = userObservations.find((obs) => obs.name === "child_task");

      expect(parent?.step).toBe(1);
      expect(child?.step).toBe(2); // Must be after parent despite timing overlap
    });

    it("should push subsequent steps forward when inserting child", () => {
      const observations: AgentGraphDataResponse[] = [
        // Parent in step 1
        createMockObservation({
          id: "parent",
          name: "parent_task",
          startTime: "2025-08-21 18:53:25.000",
          endTime: "2025-08-21 18:53:25.100",
          parentObservationId: null,
        }),
        // Child that would be step 1 due to timing, but should be step 2 due to parent constraint
        createMockObservation({
          id: "child",
          name: "child_task",
          startTime: "2025-08-21 18:53:25.050",
          endTime: "2025-08-21 18:53:25.080",
          parentObservationId: "parent",
        }),
        // Independent task that would be step 2 due to timing, should be pushed to step 3
        createMockObservation({
          id: "independent",
          name: "independent_task",
          startTime: "2025-08-21 18:53:25.200",
          endTime: "2025-08-21 18:53:25.300",
          parentObservationId: null,
        }),
      ];

      const result = buildStepData(observations);

      const userObservations = result.filter((obs) => !obs.name.includes("__"));

      const parent = userObservations.find((obs) => obs.name === "parent_task");
      const child = userObservations.find((obs) => obs.name === "child_task");
      const independent = userObservations.find(
        (obs) => obs.name === "independent_task",
      );

      expect(parent?.step).toBe(1);
      expect(child?.step).toBe(2); // Inserted due to parent constraint
      expect(independent?.step).toBe(3); // Pushed forward
    });

    it("should handle parent appearing after child in array processing order", () => {
      const observations: AgentGraphDataResponse[] = [
        // Child appears FIRST in array (would be processed first in loop)
        createMockObservation({
          id: "child",
          name: "child_task",
          startTime: "2025-08-21 18:53:25.050", // Overlaps with parent timing-wise
          endTime: "2025-08-21 18:53:25.080",
          parentObservationId: "parent",
        }),
        // Parent appears SECOND in array (would be processed second in loop)
        createMockObservation({
          id: "parent",
          name: "parent_task",
          startTime: "2025-08-21 18:53:25.000",
          endTime: "2025-08-21 18:53:25.100",
          parentObservationId: null,
        }),
      ];

      const result = buildStepData(observations);
      const userObservations = result.filter((obs) => !obs.name.includes("__"));

      const parent = userObservations.find((obs) => obs.name === "parent_task");
      const child = userObservations.find((obs) => obs.name === "child_task");

      // Should still enforce parent-child constraint despite processing order
      expect(parent?.step).toBe(1);
      expect(child?.step).toBe(2);
    });
  });

  describe("real scenario - joke evaluation case", () => {
    it("should handle the create_joke_evaluation_agent and get_joke_database_inspiration case", () => {
      const observations: AgentGraphDataResponse[] = [
        createMockObservation({
          id: "785eaa36815cb1fa",
          name: "run_smolagents_joke_evaluation",
          startTime: "2025-08-21 18:53:25.570",
          endTime: "2025-08-21 18:53:40.573",
          parentObservationId: null,
        }),
        createMockObservation({
          id: "b8fcc9d3cf148524",
          name: "create_joke_evaluation_agent",
          startTime: "2025-08-21 18:53:25.571",
          endTime: "2025-08-21 18:53:25.587",
          parentObservationId: "785eaa36815cb1fa",
        }),
        createMockObservation({
          id: "55821479672f1de5",
          name: "get_joke_database_inspiration",
          startTime: "2025-08-21 18:53:27.446", // Starts after create_joke ends
          endTime: "2025-08-21 18:53:27.446",
          parentObservationId: "785eaa36815cb1fa",
        }),
      ];

      const result = buildStepData(observations);

      const userObservations = result.filter((obs) => !obs.name.includes("__"));

      const runAgent = userObservations.find(
        (obs) => obs.name === "run_smolagents_joke_evaluation",
      );
      const createAgent = userObservations.find(
        (obs) => obs.name === "create_joke_evaluation_agent",
      );
      const getData = userObservations.find(
        (obs) => obs.name === "get_joke_database_inspiration",
      );

      expect(runAgent?.step).toBe(1);
      expect(createAgent?.step).toBe(2); // Child of run_agent, so step 2
      expect(getData?.step).toBe(3); // Child of run_agent, but starts after create_agent ends, so step 3
    });
  });

  describe("edge cases", () => {
    it("should handle empty array", () => {
      const result = buildStepData([]);
      // Should only have system nodes (__start__, __end__)
      expect(result).toHaveLength(2);
      expect(result.every((obs) => obs.name.includes("__"))).toBe(true);
    });

    it("should handle single observation", () => {
      const observations: AgentGraphDataResponse[] = [
        createMockObservation({
          id: "single",
          name: "single_task",
        }),
      ];

      const result = buildStepData(observations);

      // Should have single observation plus system nodes
      const userObservations = result.filter((obs) => !obs.name.includes("__"));
      expect(userObservations).toHaveLength(1);
      expect(userObservations[0].step).toBe(1);
    });

    it("should filter out EVENT observation types", () => {
      const observations: AgentGraphDataResponse[] = [
        createMockObservation({
          id: "agent",
          name: "agent_task",
          observationType: "AGENT",
        }),
        createMockObservation({
          id: "span",
          name: "span_task",
          observationType: "SPAN", // Currently not filtered out
        }),
        createMockObservation({
          id: "event",
          name: "event_task",
          observationType: "EVENT", // Should be filtered out
        }),
      ];

      const result = buildStepData(observations);

      const userObservations = result.filter((obs) => !obs.name.includes("__"));
      expect(userObservations).toHaveLength(2);
      expect(userObservations[0].name).toBe("agent_task");
      expect(userObservations[1].name).toBe("span_task");
    });
  });
});
