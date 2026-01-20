import { describe, it, expect } from "vitest";
import {
  convertEventInputToObservationForEval,
  safeConvertEventInputToObservationForEval,
} from "../convertEventInputToObservationForEval";
import { type EventInput } from "../../../../services/IngestionService";

describe("convertEventInputToObservationForEval", () => {
  const createValidEventInput = (
    overrides: Partial<EventInput> = {},
  ): EventInput => ({
    // Required identifiers
    projectId: "project-123",
    traceId: "trace-456",
    spanId: "span-789",
    startTimeISO: "2024-01-01T00:00:00Z",
    endTimeISO: "2024-01-01T00:00:01Z",

    // Optional identifiers
    parentSpanId: "parent-span-123",

    // Core properties
    name: "test-observation",
    type: "generation",
    environment: "production",
    version: "v1.0",
    release: "v2.0.0",

    // Trace-level
    traceName: "my-trace",
    tags: ["tag1", "tag2"],

    // User/session
    userId: "user-abc",
    sessionId: "session-xyz",
    level: "DEFAULT",
    statusMessage: "OK",

    // Prompt
    promptId: "prompt-123",
    promptName: "my-prompt",
    promptVersion: "1",

    // Model
    modelId: "model-123",
    modelName: "gpt-4",
    modelParameters: { temperature: 0.7 },

    // Usage & Cost
    providedUsageDetails: { input: 100 },
    usageDetails: { input: 100, output: 50 },
    providedCostDetails: { total: 0.01 },
    costDetails: { total: 0.01 },

    // Tool Calls
    toolDefinitions: { search: '{"description": "Search the web"}' },
    toolCalls: ['{"name": "search", "args": {"query": "test"}}'],
    toolCallNames: ["search"],

    // I/O
    input: '{"prompt": "Hello"}',
    output: '{"response": "World"}',

    // Metadata
    metadata: { key: "value" },

    // Source
    source: "otel",

    // Experiment fields
    experimentId: "exp-123",
    experimentName: "test-experiment",
    experimentDescription: "A test experiment",
    experimentDatasetId: "dataset-123",
    experimentItemId: "item-123",
    experimentItemExpectedOutput: "expected output",

    ...overrides,
  });

  describe("field mapping", () => {
    it("should map core identifiers correctly", () => {
      const input = createValidEventInput();
      const result = convertEventInputToObservationForEval(input);

      expect(result.id).toBe("span-789");
      expect(result.traceId).toBe("trace-456");
      expect(result.projectId).toBe("project-123");
      expect(result.parentObservationId).toBe("parent-span-123");
    });

    it("should map observation properties correctly", () => {
      const input = createValidEventInput();
      const result = convertEventInputToObservationForEval(input);

      expect(result.type).toBe("generation");
      expect(result.name).toBe("test-observation");
      expect(result.environment).toBe("production");
      expect(result.level).toBe("DEFAULT");
      expect(result.statusMessage).toBe("OK");
      expect(result.version).toBe("v1.0");
    });

    it("should map trace-level properties correctly", () => {
      const input = createValidEventInput();
      const result = convertEventInputToObservationForEval(input);

      expect(result.traceName).toBe("my-trace");
      expect(result.userId).toBe("user-abc");
      expect(result.sessionId).toBe("session-xyz");
      expect(result.tags).toEqual(["tag1", "tag2"]);
      expect(result.release).toBe("v2.0.0");
    });

    it("should map model properties correctly", () => {
      const input = createValidEventInput();
      const result = convertEventInputToObservationForEval(input);

      expect(result.model).toBe("gpt-4");
      // modelParameters object should be stringified
      expect(result.modelParameters).toBe('{"temperature":0.7}');
    });

    it("should handle modelParameters as string", () => {
      const input = createValidEventInput({
        modelParameters: '{"temperature": 0.7}',
      });
      const result = convertEventInputToObservationForEval(input);

      expect(result.modelParameters).toBe('{"temperature": 0.7}');
    });

    it("should handle modelParameters as null", () => {
      const input = createValidEventInput({
        modelParameters: undefined,
      });
      const result = convertEventInputToObservationForEval(input);

      expect(result.modelParameters).toBeNull();
    });

    it("should map prompt properties correctly", () => {
      const input = createValidEventInput();
      const result = convertEventInputToObservationForEval(input);

      expect(result.promptId).toBe("prompt-123");
      expect(result.promptName).toBe("my-prompt");
      expect(result.promptVersion).toBe("1");
    });

    it("should map tool call properties correctly", () => {
      const input = createValidEventInput();
      const result = convertEventInputToObservationForEval(input);

      expect(result.toolDefinitions).toEqual({
        search: '{"description": "Search the web"}',
      });
      expect(result.toolCalls).toEqual([
        '{"name": "search", "args": {"query": "test"}}',
      ]);
      expect(result.toolCallNames).toEqual(["search"]);
    });

    it("should map usage and cost properties correctly", () => {
      const input = createValidEventInput();
      const result = convertEventInputToObservationForEval(input);

      expect(result.usageDetails).toEqual({ input: 100, output: 50 });
      expect(result.costDetails).toEqual({ total: 0.01 });
      expect(result.providedUsageDetails).toEqual({ input: 100 });
      expect(result.providedCostDetails).toEqual({ total: 0.01 });
    });

    it("should map experiment properties correctly", () => {
      const input = createValidEventInput();
      const result = convertEventInputToObservationForEval(input);

      expect(result.experimentId).toBe("exp-123");
      expect(result.experimentName).toBe("test-experiment");
      expect(result.experimentDescription).toBe("A test experiment");
      expect(result.experimentDatasetId).toBe("dataset-123");
      expect(result.experimentItemId).toBe("item-123");
      expect(result.experimentItemExpectedOutput).toBe("expected output");
    });

    it("should map data fields correctly", () => {
      const input = createValidEventInput();
      const result = convertEventInputToObservationForEval(input);

      expect(result.input).toBe('{"prompt": "Hello"}');
      expect(result.output).toBe('{"response": "World"}');
      expect(result.metadata).toEqual({ key: "value" });
    });
  });

  describe("default values", () => {
    it("should provide default empty array for missing tags", () => {
      const input = createValidEventInput({ tags: undefined });
      const result = convertEventInputToObservationForEval(input);

      expect(result.tags).toEqual([]);
    });

    it("should provide default empty object for missing toolDefinitions", () => {
      const input = createValidEventInput({ toolDefinitions: undefined });
      const result = convertEventInputToObservationForEval(input);

      expect(result.toolDefinitions).toEqual({});
    });

    it("should provide default empty array for missing toolCalls", () => {
      const input = createValidEventInput({ toolCalls: undefined });
      const result = convertEventInputToObservationForEval(input);

      expect(result.toolCalls).toEqual([]);
    });

    it("should provide default empty array for missing toolCallNames", () => {
      const input = createValidEventInput({ toolCallNames: undefined });
      const result = convertEventInputToObservationForEval(input);

      expect(result.toolCallNames).toEqual([]);
    });

    it("should provide default empty object for missing usage/cost details", () => {
      const input = createValidEventInput({
        usageDetails: undefined,
        costDetails: undefined,
        providedUsageDetails: undefined,
        providedCostDetails: undefined,
      });
      const result = convertEventInputToObservationForEval(input);

      expect(result.usageDetails).toEqual({});
      expect(result.costDetails).toEqual({});
      expect(result.providedUsageDetails).toEqual({});
      expect(result.providedCostDetails).toEqual({});
    });

    it("should provide default empty object for missing metadata", () => {
      const input = createValidEventInput({
        metadata: undefined as unknown as Record<string, unknown>,
      });
      const result = convertEventInputToObservationForEval(input);

      expect(result.metadata).toEqual({});
    });
  });

  describe("null/undefined handling", () => {
    it("should handle null parentSpanId", () => {
      const input = createValidEventInput({ parentSpanId: undefined });
      const result = convertEventInputToObservationForEval(input);

      // Should be null or undefined based on schema
      expect(result.parentObservationId).toBeUndefined();
    });

    it("should handle missing optional string fields", () => {
      // name is required, so we keep it; test only truly optional fields
      const input = createValidEventInput({
        version: undefined,
        release: undefined,
        traceName: undefined,
        userId: undefined,
        sessionId: undefined,
        statusMessage: undefined,
        modelName: undefined,
        promptId: undefined,
        promptName: undefined,
        promptVersion: undefined,
        input: undefined,
        output: undefined,
      });

      const result = convertEventInputToObservationForEval(input);

      expect(result.version).toBeUndefined();
      expect(result.release).toBeUndefined();
      expect(result.traceName).toBeUndefined();
      expect(result.userId).toBeUndefined();
      expect(result.sessionId).toBeUndefined();
      expect(result.statusMessage).toBeUndefined();
      expect(result.model).toBeUndefined();
      expect(result.promptId).toBeUndefined();
      expect(result.promptName).toBeUndefined();
      expect(result.promptVersion).toBeUndefined();
      expect(result.input).toBeUndefined();
      expect(result.output).toBeUndefined();
    });

    it("should handle missing experiment fields", () => {
      const input = createValidEventInput({
        experimentId: undefined,
        experimentName: undefined,
        experimentDescription: undefined,
        experimentDatasetId: undefined,
        experimentItemId: undefined,
        experimentItemExpectedOutput: undefined,
      });

      const result = convertEventInputToObservationForEval(input);

      expect(result.experimentId).toBeUndefined();
      expect(result.experimentName).toBeUndefined();
      expect(result.experimentDescription).toBeUndefined();
      expect(result.experimentDatasetId).toBeUndefined();
      expect(result.experimentItemId).toBeUndefined();
      expect(result.experimentItemExpectedOutput).toBeUndefined();
    });
  });
});

describe("safeConvertEventInputToObservationForEval", () => {
  const createValidEventInput = (): EventInput => ({
    projectId: "project-123",
    traceId: "trace-456",
    spanId: "span-789",
    startTimeISO: "2024-01-01T00:00:00Z",
    endTimeISO: "2024-01-01T00:00:01Z",
    type: "generation",
    name: "test",
    environment: "production",
    level: "DEFAULT",
    metadata: {},
    source: "otel",
  });

  it("should return ObservationForEval for valid input", () => {
    const input = createValidEventInput();
    const result = safeConvertEventInputToObservationForEval(input);

    expect(result).not.toBeNull();
    expect(result?.id).toBe("span-789");
  });

  it("should return null for invalid input", () => {
    const invalidInput = {
      // Missing required fields
      spanId: 123, // Wrong type
    } as unknown as EventInput;

    const result = safeConvertEventInputToObservationForEval(invalidInput);

    expect(result).toBeNull();
  });
});
