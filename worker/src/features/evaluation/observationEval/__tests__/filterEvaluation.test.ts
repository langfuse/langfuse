import { describe, it, expect, vi } from "vitest";
import { type Prisma } from "@langfuse/shared/src/db";
import { scheduleObservationEvals } from "../scheduleObservationEvals";
import {
  createTestObservation,
  createTestEvalConfig,
  createMockSchedulerDeps,
} from "./fixtures";
import { type ObservationForEval, EvalTargetObject } from "@langfuse/shared";

// Mock logger to avoid noise in tests
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

describe("Filter Evaluation for Observation Evals", () => {
  const projectId = "test-project-123";

  /**
   * Helper to test if an observation matches a filter config.
   * Returns true if createJobExecution was called (meaning filter matched).
   */
  async function testFilterMatch(
    observation: ObservationForEval,
    filter: unknown[],
  ): Promise<boolean> {
    const config = createTestEvalConfig({
      projectId,
      filter,
      sampling: { toNumber: () => 1 } as unknown as Prisma.Decimal,
    });

    const deps = createMockSchedulerDeps();

    await scheduleObservationEvals({
      observation,
      configs: [config],
      schedulerDeps: deps,
    });

    return (
      (deps.upsertJobExecution as ReturnType<typeof vi.fn>).mock.calls.length >
      0
    );
  }

  describe("string filters", () => {
    describe("equals operator", () => {
      it("should match when name equals filter value", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          name: "my-generation",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "name",
            type: "string",
            operator: "=",
            value: "my-generation",
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when name does not equal filter value", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          name: "my-generation",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "name",
            type: "string",
            operator: "=",
            value: "other-name",
          },
        ]);

        expect(matched).toBe(false);
      });
    });

    describe("contains operator", () => {
      it("should match when name contains filter value", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          name: "my-special-generation",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "name",
            type: "string",
            operator: "contains",
            value: "special",
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when name does not contain filter value", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          name: "my-generation",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "name",
            type: "string",
            operator: "contains",
            value: "special",
          },
        ]);

        expect(matched).toBe(false);
      });
    });

    describe("does not contain operator", () => {
      it("should match when name does not contain filter value", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          name: "my-generation",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "name",
            type: "string",
            operator: "does not contain",
            value: "special",
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when name contains filter value", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          name: "my-special-generation",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "name",
            type: "string",
            operator: "does not contain",
            value: "special",
          },
        ]);

        expect(matched).toBe(false);
      });
    });

    describe("starts with operator", () => {
      it("should match when name starts with filter value", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          name: "chat-completion-v2",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "name",
            type: "string",
            operator: "starts with",
            value: "chat-",
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when name does not start with filter value", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          name: "completion-chat-v2",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "name",
            type: "string",
            operator: "starts with",
            value: "chat-",
          },
        ]);

        expect(matched).toBe(false);
      });
    });

    describe("ends with operator", () => {
      it("should match when name ends with filter value", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          name: "chat-completion-v2",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "name",
            type: "string",
            operator: "ends with",
            value: "-v2",
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when name does not end with filter value", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          name: "chat-completion-v1",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "name",
            type: "string",
            operator: "ends with",
            value: "-v2",
          },
        ]);

        expect(matched).toBe(false);
      });
    });

    describe("null/undefined handling", () => {
      it("should treat null as empty string for string filters", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          version: null as unknown as string,
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "version",
            type: "string",
            operator: "=",
            value: "",
          },
        ]);

        expect(matched).toBe(true);
      });
    });
  });

  describe("stringOptions filters", () => {
    describe("any of operator", () => {
      it("should match when type is in allowed list", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          type: "GENERATION",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["GENERATION", "SPAN"],
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when type is not in allowed list", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          type: "EVENT",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["GENERATION", "SPAN"],
          },
        ]);

        expect(matched).toBe(false);
      });

      it("should match single value in list", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          environment: "production",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: ["production"],
          },
        ]);

        expect(matched).toBe(true);
      });
    });

    describe("none of operator", () => {
      it("should match when type is not in excluded list", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          type: "EVENT",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "type",
            type: "stringOptions",
            operator: "none of",
            value: ["GENERATION", "SPAN"],
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when type is in excluded list", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          type: "GENERATION",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "type",
            type: "stringOptions",
            operator: "none of",
            value: ["GENERATION", "SPAN"],
          },
        ]);

        expect(matched).toBe(false);
      });
    });

    describe("level filtering", () => {
      it("should filter by log level", async () => {
        const errorObservation = createTestObservation({
          project_id: projectId,
          level: "ERROR",
        });

        const matched = await testFilterMatch(errorObservation, [
          {
            column: "level",
            type: "stringOptions",
            operator: "any of",
            value: ["ERROR", "WARNING"],
          },
        ]);

        expect(matched).toBe(true);
      });
    });
  });

  describe("arrayOptions filters (tags)", () => {
    describe("any of operator", () => {
      it("should match when any tag is in filter list", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          tags: ["important", "reviewed", "production"],
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "tags",
            type: "arrayOptions",
            operator: "any of",
            value: ["important", "critical"],
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when no tags are in filter list", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          tags: ["test", "staging"],
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "tags",
            type: "arrayOptions",
            operator: "any of",
            value: ["important", "critical"],
          },
        ]);

        expect(matched).toBe(false);
      });

      it("should not match when tags is empty array", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          tags: [],
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "tags",
            type: "arrayOptions",
            operator: "any of",
            value: ["important"],
          },
        ]);

        expect(matched).toBe(false);
      });
    });

    describe("none of operator", () => {
      it("should match when no tags are in excluded list", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          tags: ["reviewed", "production"],
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "tags",
            type: "arrayOptions",
            operator: "none of",
            value: ["test", "staging"],
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when any tag is in excluded list", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          tags: ["production", "test"],
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "tags",
            type: "arrayOptions",
            operator: "none of",
            value: ["test", "staging"],
          },
        ]);

        expect(matched).toBe(false);
      });

      it("should match when tags is empty (nothing to exclude)", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          tags: [],
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "tags",
            type: "arrayOptions",
            operator: "none of",
            value: ["test"],
          },
        ]);

        expect(matched).toBe(true);
      });
    });

    describe("all of operator", () => {
      it("should match when all filter values are in tags", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          tags: ["important", "reviewed", "production"],
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "tags",
            type: "arrayOptions",
            operator: "all of",
            value: ["important", "reviewed"],
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when not all filter values are in tags", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          tags: ["important", "production"],
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "tags",
            type: "arrayOptions",
            operator: "all of",
            value: ["important", "reviewed"],
          },
        ]);

        expect(matched).toBe(false);
      });
    });
  });

  describe("stringObject filters (metadata)", () => {
    describe("equals operator with key", () => {
      it("should match metadata key value", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          metadata: { customer: "acme", tier: "premium" },
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "metadata",
            type: "stringObject",
            key: "customer",
            operator: "=",
            value: "acme",
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when metadata key has different value", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          metadata: { customer: "other-corp" },
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "metadata",
            type: "stringObject",
            key: "customer",
            operator: "=",
            value: "acme",
          },
        ]);

        expect(matched).toBe(false);
      });

      it("should not match when metadata key does not exist", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          metadata: { tier: "premium" },
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "metadata",
            type: "stringObject",
            key: "customer",
            operator: "=",
            value: "acme",
          },
        ]);

        expect(matched).toBe(false);
      });
    });

    describe("contains operator with key", () => {
      it("should match when metadata key value contains substring", async () => {
        const observation = createTestObservation({
          project_id: projectId,
          metadata: { environment: "production-us-west-2" },
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "metadata",
            type: "stringObject",
            key: "environment",
            operator: "contains",
            value: "production",
          },
        ]);

        expect(matched).toBe(true);
      });
    });
  });

  describe("multiple filter conditions (AND logic)", () => {
    it("should match when all conditions are satisfied", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        type: "GENERATION",
        level: "DEFAULT",
        environment: "production",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "type",
          type: "stringOptions",
          operator: "any of",
          value: ["GENERATION"],
        },
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["DEFAULT", "DEBUG"],
        },
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
      ]);

      expect(matched).toBe(true);
    });

    it("should not match when any condition fails", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        type: "GENERATION",
        level: "ERROR", // Doesn't match DEFAULT filter
        environment: "production",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "type",
          type: "stringOptions",
          operator: "any of",
          value: ["GENERATION"],
        },
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["DEFAULT", "DEBUG"],
        },
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
      ]);

      expect(matched).toBe(false);
    });

    it("should handle complex filter combinations", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        type: "GENERATION",
        name: "chat-completion-handler",
        tags: ["important", "production"],
        metadata: { version: "2.0" },
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "type",
          type: "stringOptions",
          operator: "any of",
          value: ["GENERATION"],
        },
        {
          column: "name",
          type: "string",
          operator: "contains",
          value: "chat",
        },
        {
          column: "tags",
          type: "arrayOptions",
          operator: "any of",
          value: ["important"],
        },
        {
          column: "metadata",
          type: "stringObject",
          key: "version",
          operator: "=",
          value: "2.0",
        },
      ]);

      expect(matched).toBe(true);
    });
  });

  describe("empty filter", () => {
    it("should match all observations when filter is empty array", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        type: "SPAN",
        name: "any-name",
      });

      const matched = await testFilterMatch(observation, []);

      expect(matched).toBe(true);
    });

    it("should match all observations when filter is null-ish", async () => {
      const observation = createTestObservation({ project_id: projectId });
      const config = createTestEvalConfig({
        projectId,
        filter: null as unknown as Prisma.JsonValue,
        sampling: { toNumber: () => 1 } as unknown as Prisma.Decimal,
      });

      const deps = createMockSchedulerDeps();

      await scheduleObservationEvals({
        observation,
        configs: [config],
        schedulerDeps: deps,
      });

      expect(deps.upsertJobExecution).toHaveBeenCalled();
    });
  });

  describe("trace-level property filtering", () => {
    it("should filter by trace_name", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        trace_name: "user-query-handler",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "traceName",
          type: "string",
          operator: "contains",
          value: "query",
        },
      ]);

      expect(matched).toBe(true);
    });

    it("should filter by user_id", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        user_id: "user-123",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "userId",
          type: "string",
          operator: "=",
          value: "user-123",
        },
      ]);

      expect(matched).toBe(true);
    });

    it("should filter by session_id", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        session_id: "session-abc",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "sessionId",
          type: "string",
          operator: "=",
          value: "session-abc",
        },
      ]);

      expect(matched).toBe(true);
    });
  });

  describe("experiment target object filtering", () => {
    /**
     * Helper to test experiment target object filtering.
     * Returns true if createJobExecution was called (meaning filter matched).
     */
    async function testExperimentFilterMatch(
      observation: ObservationForEval,
      filter: unknown[] = [],
    ): Promise<boolean> {
      const config = createTestEvalConfig({
        projectId,
        filter,
        sampling: { toNumber: () => 1 } as unknown as Prisma.Decimal,
        targetObject: EvalTargetObject.EXPERIMENT,
      });

      const deps = createMockSchedulerDeps();

      await scheduleObservationEvals({
        observation,
        configs: [config],
        schedulerDeps: deps,
      });

      return (
        (deps.upsertJobExecution as ReturnType<typeof vi.fn>).mock.calls
          .length > 0
      );
    }

    it("should match when span_id equals experiment_item_root_span_id", async () => {
      const spanId = "span-123";
      const observation = createTestObservation({
        project_id: projectId,
        span_id: spanId,
        experiment_item_root_span_id: spanId,
      });

      const matched = await testExperimentFilterMatch(observation);

      expect(matched).toBe(true);
    });

    it("should not match when span_id does not equal experiment_item_root_span_id", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        span_id: "span-123",
        experiment_item_root_span_id: "span-456",
      });

      const matched = await testExperimentFilterMatch(observation);

      expect(matched).toBe(false);
    });

    it("should not match when experiment_item_root_span_id is null", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        span_id: "span-123",
        experiment_item_root_span_id: null,
      });

      const matched = await testExperimentFilterMatch(observation);

      expect(matched).toBe(false);
    });

    it("should apply filter conditions when targetObject is EXPERIMENT", async () => {
      const spanId = "span-123";
      const observation = createTestObservation({
        project_id: projectId,
        span_id: spanId,
        experiment_item_root_span_id: spanId,
        experiment_dataset_id: "dataset-123",
      });

      // Filter that excludes this observation's dataset
      const matched = await testExperimentFilterMatch(observation, [
        {
          column: "experimentDatasetId",
          type: "stringOptions",
          operator: "any of",
          value: ["dataset-456"], // Observation has dataset-123
        },
      ]);

      // Should NOT match because filter conditions are applied for experiment configs
      expect(matched).toBe(false);
    });

    it("should match experiment when filter matches and is root span", async () => {
      const spanId = "span-123";
      const observation = createTestObservation({
        project_id: projectId,
        span_id: spanId,
        experiment_item_root_span_id: spanId,
        experiment_dataset_id: "dataset-123",
      });

      // Filter that includes this observation's dataset
      const matched = await testExperimentFilterMatch(observation, [
        {
          column: "experimentDatasetId",
          type: "stringOptions",
          operator: "any of",
          value: ["dataset-123", "dataset-456"],
        },
      ]);

      // Should match because filter passes AND observation is experiment root span
      expect(matched).toBe(true);
    });

    it("should not match experiment when filter matches but is not root span", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        span_id: "child-span-456",
        experiment_item_root_span_id: "root-span-123",
        experiment_dataset_id: "dataset-123",
      });

      // Filter matches the observation
      const matched = await testExperimentFilterMatch(observation, [
        {
          column: "experimentDatasetId",
          type: "stringOptions",
          operator: "any of",
          value: ["dataset-123"],
        },
      ]);

      // Should NOT match because observation is not the experiment root span
      expect(matched).toBe(false);
    });

    it("should not match child spans even if they have experiment properties", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        span_id: "child-span-456",
        experiment_item_root_span_id: "root-span-123",
        experiment_id: "exp-1",
        experiment_name: "my-experiment",
      });

      const matched = await testExperimentFilterMatch(observation);

      // Child spans should not match, only the root span
      expect(matched).toBe(false);
    });
  });

  describe("null filters (parentObservationId)", () => {
    it("should match observations where parentObservationId is null (root observations)", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        parent_span_id: null,
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "parentObservationId",
          type: "null",
          operator: "is null",
          value: "",
        },
      ]);

      expect(matched).toBe(true);
    });

    it("should not match observations where parentObservationId is not null (child observations)", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        parent_span_id: "some-parent-span-id",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "parentObservationId",
          type: "null",
          operator: "is null",
          value: "",
        },
      ]);

      expect(matched).toBe(false);
    });

    it("should match observations where parentObservationId is not null using 'is not null' operator", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        parent_span_id: "some-parent-span-id",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "parentObservationId",
          type: "null",
          operator: "is not null",
          value: "",
        },
      ]);

      expect(matched).toBe(true);
    });

    it("should not match root observations with parentObservationId is not null using 'is not null' operator", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        parent_span_id: null,
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "parentObservationId",
          type: "null",
          operator: "is not null",
          value: "",
        },
      ]);

      expect(matched).toBe(false);
    });

    it("should combine null filter with other filters using AND logic", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        parent_span_id: null,
        type: "GENERATION",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "parentObservationId",
          type: "null",
          operator: "is null",
          value: "",
        },
        {
          column: "type",
          type: "stringOptions",
          operator: "any of",
          value: ["GENERATION"],
        },
      ]);

      expect(matched).toBe(true);
    });

    it("should not match when null filter passes but other filter fails", async () => {
      const observation = createTestObservation({
        project_id: projectId,
        parent_span_id: null,
        type: "SPAN",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "parentObservationId",
          type: "null",
          operator: "is null",
          value: "",
        },
        {
          column: "type",
          type: "stringOptions",
          operator: "any of",
          value: ["GENERATION"],
        },
      ]);

      expect(matched).toBe(false);
    });
  });
});
