import { describe, it, expect } from "vitest";
import { extractObservationVariables } from "./extractObservationVariables";
import { type ObservationEvent } from "./types";
import { type ObservationVariableMapping } from "@langfuse/shared";

describe("extractObservationVariables", () => {
  const mockObservation: ObservationEvent = {
    projectId: "project-789",
    traceId: "trace-456",
    spanId: "obs-123",
    startTimeISO: new Date().toISOString(),
    endTimeISO: new Date().toISOString(),
    type: "generation",
    name: "chat-completion",
    environment: "production",
    version: "v1.0",
    release: "v2.0.0",
    level: "DEFAULT",
    statusMessage: undefined,
    modelName: "gpt-4",
    modelId: "model-123",
    modelParameters: { temperature: 0.7 },
    input: JSON.stringify({
      prompt: "Hello, how are you?",
      context: "greeting",
    }),
    output: JSON.stringify({
      response: "I am fine, thank you!",
      sentiment: "positive",
    }),
    metadata: { userId: "user-123", customField: "custom-value" },
    userId: "user-abc",
    sessionId: "session-xyz",
    tags: ["tag1", "tag2"],
    providedUsageDetails: {},
    usageDetails: { input: 100, output: 50 },
    providedCostDetails: {},
    costDetails: {},
    source: "otel",
  };

  describe("basic variable extraction", () => {
    it("should extract input variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "input", selectedColumnId: "input" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("input");
      expect(result[0].value).toBe(mockObservation.input);
    });

    it("should extract output variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "output", selectedColumnId: "output" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("output");
      expect(result[0].value).toBe(mockObservation.output);
    });

    it("should extract metadata variable as JSON string", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "meta", selectedColumnId: "metadata" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("meta");
      expect(result[0].value).toBe(JSON.stringify(mockObservation.metadata));
    });

    it("should extract multiple variables", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "userInput", selectedColumnId: "input" },
        { templateVariable: "modelOutput", selectedColumnId: "output" },
        { templateVariable: "metadata", selectedColumnId: "metadata" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(3);
      expect(result[0].var).toBe("userInput");
      expect(result[0].value).toBe(mockObservation.input);
      expect(result[1].var).toBe("modelOutput");
      expect(result[1].value).toBe(mockObservation.output);
      expect(result[2].var).toBe("metadata");
    });
  });

  describe("environment extraction", () => {
    it("should include environment on the first variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "input", selectedColumnId: "input" },
        { templateVariable: "output", selectedColumnId: "output" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result[0].environment).toBe("production");
      expect(result[1].environment).toBeUndefined();
    });

    it("should not include environment if observation has no environment", () => {
      const obsWithoutEnv: ObservationEvent = {
        ...mockObservation,
        environment: undefined,
      };

      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "input", selectedColumnId: "input" },
      ];

      const result = extractObservationVariables({
        observation: obsWithoutEnv,
        variableMapping,
      });

      expect(result[0].environment).toBeUndefined();
    });
  });

  describe("JSON selector extraction", () => {
    it("should apply JSON selector to extract nested field from input", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "prompt",
          selectedColumnId: "input",
          jsonSelector: "$.prompt",
        },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      // JSONPath returns an array, which gets JSON-stringified
      expect(result[0].value).toBe(JSON.stringify(["Hello, how are you?"]));
    });

    it("should apply JSON selector to extract nested field from output", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "response",
          selectedColumnId: "output",
          jsonSelector: "$.response",
        },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result[0].value).toBe(JSON.stringify(["I am fine, thank you!"]));
    });

    it("should handle null jsonSelector by returning full value", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "input",
          selectedColumnId: "input",
          jsonSelector: null,
        },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result[0].value).toBe(mockObservation.input);
    });

    it("should handle undefined jsonSelector by returning full value", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "input",
          selectedColumnId: "input",
          jsonSelector: undefined,
        },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result[0].value).toBe(mockObservation.input);
    });
  });

  describe("edge cases", () => {
    it("should handle empty variable mapping", () => {
      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping: [],
      });

      expect(result).toEqual([]);
    });

    it("should handle null/undefined column values as empty strings", () => {
      const observationWithNulls: ObservationEvent = {
        ...mockObservation,
        input: null as unknown as string,
        output: undefined as unknown as string,
      };

      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "input", selectedColumnId: "input" },
        { templateVariable: "output", selectedColumnId: "output" },
      ];

      const result = extractObservationVariables({
        observation: observationWithNulls,
        variableMapping,
      });

      expect(result[0].value).toBe("");
      expect(result[1].value).toBe("");
    });

    it("should handle invalid JSON selector gracefully", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "field",
          selectedColumnId: "input",
          jsonSelector: "$.nonexistent.deeply.nested",
        },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      // JSONPath returns empty array for non-matching paths
      expect(result[0].value).toBe("[]");
    });

    it("should handle non-JSON string column with JSON selector", () => {
      const observationWithPlainText: ObservationEvent = {
        ...mockObservation,
        input: "plain text, not JSON",
      };

      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "input",
          selectedColumnId: "input",
          jsonSelector: "$.field",
        },
      ];

      const result = extractObservationVariables({
        observation: observationWithPlainText,
        variableMapping,
      });

      // Should fall back to original value when JSON parsing fails
      expect(result[0].value).toBe("plain text, not JSON");
    });
  });

  describe("column ID mapping", () => {
    it("should map 'input' to observation input field", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "var", selectedColumnId: "input" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result[0].value).toBe(mockObservation.input);
    });

    it("should map 'output' to observation output field", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "var", selectedColumnId: "output" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result[0].value).toBe(mockObservation.output);
    });

    it("should map 'metadata' to observation metadata field as JSON string", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "var", selectedColumnId: "metadata" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result[0].value).toBe(JSON.stringify(mockObservation.metadata));
    });
  });
});
