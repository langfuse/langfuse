import { describe, it, expect } from "vitest";
import { extractObservationVariables } from "../extractObservationVariables";
import { type ObservationForEval } from "../types";
import { type ObservationVariableMapping } from "@langfuse/shared";

describe("extractObservationVariables", () => {
  const mockObservation: ObservationForEval = {
    // Core identifiers
    id: "obs-123",
    traceId: "trace-456",
    projectId: "project-789",
    parentObservationId: null,

    // Observation properties
    type: "generation",
    name: "chat-completion",
    environment: "production",
    level: "DEFAULT",
    statusMessage: null,
    version: "v1.0",

    // Trace-level properties
    traceName: "my-trace",
    userId: "user-abc",
    sessionId: "session-xyz",
    tags: ["tag1", "tag2"],
    release: "v2.0.0",

    // Model properties
    model: "gpt-4",
    modelParameters: '{"temperature": 0.7}',

    // Prompt properties
    promptId: null,
    promptName: null,
    promptVersion: null,

    // Tool call properties
    toolDefinitions: { search: '{"description": "Search the web"}' },
    toolCalls: ['{"name": "search", "args": {"query": "test"}}'],
    toolCallNames: ["search"],

    // Usage & Cost
    usageDetails: { input: 100, output: 50 },
    costDetails: {},
    providedUsageDetails: {},
    providedCostDetails: {},

    // Experiment properties
    experimentId: null,
    experimentName: null,
    experimentDescription: null,
    experimentDatasetId: null,
    experimentItemId: null,
    experimentItemExpectedOutput: "expected response",

    // Data fields
    input: JSON.stringify({
      prompt: "Hello, how are you?",
      context: "greeting",
    }),
    output: JSON.stringify({
      response: "I am fine, thank you!",
      sentiment: "positive",
    }),
    metadata: { userId: "user-123", customField: "custom-value" },
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

  describe("tool call extraction", () => {
    it("should extract toolCalls variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "tools", selectedColumnId: "toolCalls" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("tools");
      expect(result[0].value).toBe(JSON.stringify(mockObservation.toolCalls));
    });

    it("should extract toolDefinitions variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "definitions",
          selectedColumnId: "toolDefinitions",
        },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("definitions");
      expect(result[0].value).toBe(
        JSON.stringify(mockObservation.toolDefinitions),
      );
    });
  });

  describe("model extraction", () => {
    it("should extract model variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "modelName", selectedColumnId: "model" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("modelName");
      expect(result[0].value).toBe("gpt-4");
    });

    it("should extract modelParameters variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "params", selectedColumnId: "modelParameters" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("params");
      expect(result[0].value).toBe(mockObservation.modelParameters);
    });
  });

  describe("experiment extraction", () => {
    it("should extract experimentItemExpectedOutput variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "expected",
          selectedColumnId: "experimentItemExpectedOutput",
        },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("expected");
      expect(result[0].value).toBe("expected response");
    });
  });

  describe("usage extraction", () => {
    it("should extract usageDetails variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "usage", selectedColumnId: "usageDetails" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("usage");
      expect(result[0].value).toBe(
        JSON.stringify(mockObservation.usageDetails),
      );
    });

    it("should extract costDetails variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "cost", selectedColumnId: "costDetails" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("cost");
      expect(result[0].value).toBe(JSON.stringify(mockObservation.costDetails));
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
      const observationWithNulls: ObservationForEval = {
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
      const observationWithPlainText: ObservationForEval = {
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
