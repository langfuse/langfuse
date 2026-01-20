import { describe, it, expect } from "vitest";
import {
  observationForEvalSchema,
  type ObservationForEval,
  observationEvalFilterColumns,
  observationEvalVariableColumns,
} from "@langfuse/shared";

describe("observationForEvalSchema", () => {
  describe("schema field validation", () => {
    it("should parse valid id field", () => {
      const evalId = observationForEvalSchema.shape.id;
      expect(evalId.parse("test-id")).toBe("test-id");
    });

    it("should parse valid type field", () => {
      const evalType = observationForEvalSchema.shape.type;
      expect(evalType.parse("generation")).toBe("generation");
    });

    it("should have environment field with default value", () => {
      // Environment has a default of "default" in the base schema
      const result = observationForEvalSchema.parse({
        id: "test",
        traceId: "trace",
        projectId: "project",
        parentObservationId: null,
        type: "generation",
        name: "test",
        level: "DEFAULT",
        statusMessage: null,
        version: null,
        traceName: null,
        userId: null,
        sessionId: null,
        tags: [],
        release: null,
        model: null,
        modelParameters: null,
        promptId: null,
        promptName: null,
        promptVersion: null,
        toolDefinitions: {},
        toolCalls: [],
        toolCallNames: [],
        usageDetails: {},
        costDetails: {},
        providedUsageDetails: {},
        providedCostDetails: {},
        experimentId: null,
        experimentName: null,
        experimentDescription: null,
        experimentDatasetId: null,
        experimentItemId: null,
        experimentItemExpectedOutput: null,
        input: null,
        output: null,
        metadata: {},
      });

      expect(result.environment).toBe("default");
    });
  });

  describe("schema validation", () => {
    const validObservation: ObservationForEval = {
      id: "obs-123",
      traceId: "trace-456",
      projectId: "project-789",
      parentObservationId: null,
      type: "generation",
      name: "test-observation",
      environment: "production",
      level: "DEFAULT",
      statusMessage: null,
      version: "v1.0",
      traceName: "my-trace",
      userId: "user-123",
      sessionId: "session-456",
      tags: ["tag1", "tag2"],
      release: "v2.0.0",
      model: "gpt-4",
      modelParameters: '{"temperature": 0.7}',
      promptId: null,
      promptName: "my-prompt",
      promptVersion: null,
      toolDefinitions: { search: '{"description": "Search"}' },
      toolCalls: ['{"name": "search"}'],
      toolCallNames: ["search"],
      usageDetails: { input: 100, output: 50 },
      costDetails: { total: 0.01 },
      providedUsageDetails: {},
      providedCostDetails: {},
      experimentId: "exp-123",
      experimentName: "test-experiment",
      experimentDescription: "A test",
      experimentDatasetId: "dataset-123",
      experimentItemId: "item-123",
      experimentItemExpectedOutput: "expected output",
      input: '{"prompt": "Hello"}',
      output: '{"response": "World"}',
      metadata: { key: "value" },
    };

    it("should parse a valid observation", () => {
      const result = observationForEvalSchema.parse(validObservation);
      expect(result).toEqual(validObservation);
    });

    it("should accept null for nullable fields", () => {
      const observationWithNulls: ObservationForEval = {
        ...validObservation,
        parentObservationId: null,
        statusMessage: null,
        version: null,
        traceName: null,
        userId: null,
        sessionId: null,
        release: null,
        model: null,
        modelParameters: null,
        promptId: null,
        promptName: null,
        promptVersion: null,
        experimentId: null,
        experimentName: null,
        experimentDescription: null,
        experimentDatasetId: null,
        experimentItemId: null,
        experimentItemExpectedOutput: null,
        input: null,
        output: null,
      };

      const result = observationForEvalSchema.parse(observationWithNulls);
      expect(result.userId).toBeNull();
      expect(result.model).toBeNull();
      expect(result.input).toBeNull();
    });

    it("should accept empty arrays for array fields", () => {
      const observationWithEmptyArrays = {
        ...validObservation,
        tags: [],
        toolCalls: [],
        toolCallNames: [],
      };

      const result = observationForEvalSchema.parse(observationWithEmptyArrays);
      expect(result.tags).toEqual([]);
      expect(result.toolCalls).toEqual([]);
      expect(result.toolCallNames).toEqual([]);
    });

    it("should accept empty objects for record fields", () => {
      const observationWithEmptyObjects = {
        ...validObservation,
        toolDefinitions: {},
        usageDetails: {},
        costDetails: {},
        metadata: {},
      };

      const result = observationForEvalSchema.parse(
        observationWithEmptyObjects,
      );
      expect(result.toolDefinitions).toEqual({});
      expect(result.metadata).toEqual({});
    });

    it("should fail for missing required fields", () => {
      const invalidObservation = {
        id: "obs-123",
        // Missing other required fields
      };

      expect(() =>
        observationForEvalSchema.parse(invalidObservation),
      ).toThrow();
    });
  });

  describe("filter columns alignment", () => {
    it("should have all filter column IDs present in schema", () => {
      const schemaKeys = Object.keys(observationForEvalSchema.shape);

      for (const column of observationEvalFilterColumns) {
        expect(schemaKeys).toContain(column.id);
      }
    });

    it("should include expected filter columns", () => {
      const columnIds = observationEvalFilterColumns.map((c) => c.id);

      // Observation properties
      expect(columnIds).toContain("type");
      expect(columnIds).toContain("name");
      expect(columnIds).toContain("environment");
      expect(columnIds).toContain("level");
      expect(columnIds).toContain("version");

      // Trace-level properties
      expect(columnIds).toContain("traceName");
      expect(columnIds).toContain("userId");
      expect(columnIds).toContain("sessionId");
      expect(columnIds).toContain("tags");
      expect(columnIds).toContain("release");

      // Model/Prompt properties
      expect(columnIds).toContain("model");
      expect(columnIds).toContain("promptName");

      // Tool properties
      expect(columnIds).toContain("toolCallNames");

      // Experiment properties
      expect(columnIds).toContain("experimentId");
      expect(columnIds).toContain("experimentName");

      // Metadata
      expect(columnIds).toContain("metadata");
    });
  });

  describe("variable columns alignment", () => {
    it("should have all variable column IDs present in schema", () => {
      const schemaKeys = Object.keys(observationForEvalSchema.shape);

      for (const column of observationEvalVariableColumns) {
        expect(schemaKeys).toContain(column.id);
      }
    });

    it("should include expected variable columns", () => {
      const columnIds = observationEvalVariableColumns.map((c) => c.id);

      // Primary data fields
      expect(columnIds).toContain("input");
      expect(columnIds).toContain("output");
      expect(columnIds).toContain("metadata");

      // Tool call data
      expect(columnIds).toContain("toolDefinitions");
      expect(columnIds).toContain("toolCalls");

      // Model data
      expect(columnIds).toContain("model");
      expect(columnIds).toContain("modelParameters");

      // Usage data
      expect(columnIds).toContain("usageDetails");
      expect(columnIds).toContain("costDetails");

      // Experiment data
      expect(columnIds).toContain("experimentItemExpectedOutput");
    });
  });
});
