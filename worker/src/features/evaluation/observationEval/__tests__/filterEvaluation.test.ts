import { describe, it, expect, vi } from "vitest";
import { type Prisma } from "@langfuse/shared/src/db";
import { scheduleObservationEvals } from "../scheduleObservationEvals";
import {
  createTestObservation,
  createTestEvalConfig,
  createMockSchedulerDeps,
} from "./fixtures";
import { type ObservationForEval } from "@langfuse/shared";

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
      (deps.createJobExecution as ReturnType<typeof vi.fn>).mock.calls.length >
      0
    );
  }

  describe("string filters", () => {
    describe("equals operator", () => {
      it("should match when name equals filter value", async () => {
        const observation = createTestObservation({
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
          type: "generation",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["generation", "span"],
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when type is not in allowed list", async () => {
        const observation = createTestObservation({
          projectId,
          type: "event",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["generation", "span"],
          },
        ]);

        expect(matched).toBe(false);
      });

      it("should match single value in list", async () => {
        const observation = createTestObservation({
          projectId,
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
          projectId,
          type: "event",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "type",
            type: "stringOptions",
            operator: "none of",
            value: ["generation", "span"],
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should not match when type is in excluded list", async () => {
        const observation = createTestObservation({
          projectId,
          type: "generation",
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "type",
            type: "stringOptions",
            operator: "none of",
            value: ["generation", "span"],
          },
        ]);

        expect(matched).toBe(false);
      });
    });

    describe("model filtering", () => {
      it("should filter by model name", async () => {
        const gpt4Observation = createTestObservation({
          projectId,
          model: "gpt-4",
        });

        const matched = await testFilterMatch(gpt4Observation, [
          {
            column: "model",
            type: "stringOptions",
            operator: "any of",
            value: ["gpt-4", "gpt-4-turbo"],
          },
        ]);

        expect(matched).toBe(true);
      });

      it("should exclude specific models", async () => {
        const gpt35Observation = createTestObservation({
          projectId,
          model: "gpt-3.5-turbo",
        });

        const matched = await testFilterMatch(gpt35Observation, [
          {
            column: "model",
            type: "stringOptions",
            operator: "none of",
            value: ["gpt-3.5-turbo"],
          },
        ]);

        expect(matched).toBe(false);
      });
    });

    describe("level filtering", () => {
      it("should filter by log level", async () => {
        const errorObservation = createTestObservation({
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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

    describe("toolCallNames filtering", () => {
      it("should filter by tool call names", async () => {
        const observation = createTestObservation({
          projectId,
          toolCallNames: ["search", "calculate"],
        });

        const matched = await testFilterMatch(observation, [
          {
            column: "toolCallNames",
            type: "arrayOptions",
            operator: "any of",
            value: ["search"],
          },
        ]);

        expect(matched).toBe(true);
      });
    });
  });

  describe("stringObject filters (metadata)", () => {
    describe("equals operator with key", () => {
      it("should match metadata key value", async () => {
        const observation = createTestObservation({
          projectId,
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
          projectId,
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
          projectId,
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
          projectId,
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
        projectId,
        type: "generation",
        model: "gpt-4",
        environment: "production",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "type",
          type: "stringOptions",
          operator: "any of",
          value: ["generation"],
        },
        {
          column: "model",
          type: "stringOptions",
          operator: "any of",
          value: ["gpt-4", "gpt-4-turbo"],
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
        projectId,
        type: "generation",
        model: "gpt-3.5-turbo", // Doesn't match gpt-4 filter
        environment: "production",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "type",
          type: "stringOptions",
          operator: "any of",
          value: ["generation"],
        },
        {
          column: "model",
          type: "stringOptions",
          operator: "any of",
          value: ["gpt-4", "gpt-4-turbo"],
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
        projectId,
        type: "generation",
        name: "chat-completion-handler",
        tags: ["important", "production"],
        metadata: { version: "2.0" },
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "type",
          type: "stringOptions",
          operator: "any of",
          value: ["generation"],
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
        projectId,
        type: "span",
        name: "any-name",
      });

      const matched = await testFilterMatch(observation, []);

      expect(matched).toBe(true);
    });

    it("should match all observations when filter is null-ish", async () => {
      const observation = createTestObservation({ projectId });
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

      expect(deps.createJobExecution).toHaveBeenCalled();
    });
  });

  describe("trace-level property filtering", () => {
    it("should filter by traceName", async () => {
      const observation = createTestObservation({
        projectId,
        traceName: "user-query-handler",
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

    it("should filter by userId", async () => {
      const observation = createTestObservation({
        projectId,
        userId: "user-123",
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

    it("should filter by sessionId", async () => {
      const observation = createTestObservation({
        projectId,
        sessionId: "session-abc",
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

    it("should filter by release", async () => {
      const observation = createTestObservation({
        projectId,
        release: "v2.0.0",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "release",
          type: "string",
          operator: "starts with",
          value: "v2",
        },
      ]);

      expect(matched).toBe(true);
    });
  });

  describe("experiment property filtering", () => {
    it("should filter by experimentName", async () => {
      const observation = createTestObservation({
        projectId,
        experimentName: "prompt-optimization-v2",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "experimentName",
          type: "string",
          operator: "contains",
          value: "optimization",
        },
      ]);

      expect(matched).toBe(true);
    });

    it("should filter by experimentId", async () => {
      const observation = createTestObservation({
        projectId,
        experimentId: "exp-123",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "experimentId",
          type: "string",
          operator: "=",
          value: "exp-123",
        },
      ]);

      expect(matched).toBe(true);
    });
  });

  describe("prompt property filtering", () => {
    it("should filter by promptName", async () => {
      const observation = createTestObservation({
        projectId,
        promptName: "customer-support-v3",
      });

      const matched = await testFilterMatch(observation, [
        {
          column: "promptName",
          type: "stringOptions",
          operator: "any of",
          value: ["customer-support-v3", "customer-support-v2"],
        },
      ]);

      expect(matched).toBe(true);
    });
  });
});
