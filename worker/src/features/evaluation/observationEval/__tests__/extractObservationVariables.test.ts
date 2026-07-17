import { describe, it, expect } from "vitest";
import { extractObservationVariables } from "../../../../../../packages/shared/src/server/evals/extractObservationVariables";
import { type ObservationForEval } from "../types";
import {
  observationEvalVariableColumns,
  ObservationEvalVariableColumn,
  type ObservationVariableMapping,
} from "@langfuse/shared";

// Test-only superset: extends the production columns with fields that are not
// mappable in the product today, to cover extractObservationVariables'
// custom-columns parameter.
const availableObservationEvalVariableColumns = [
  ...observationEvalVariableColumns,
  {
    id: "toolDefinitions",
    name: "Tool Definitions",
    description: "Tool definitions",
    internal: "tool_definitions",
  },
  {
    id: "toolCallNames",
    name: "Tool Call Names",
    description: "Tool call names",
    internal: "tool_call_names",
  },
  {
    id: "providedModelName",
    name: "Model",
    description: "Model",
    internal: "provided_model_name",
  },
  {
    id: "modelParameters",
    name: "Model Parameters",
    description: "Model parameters",
    internal: "model_parameters",
  },
  {
    id: "usageDetails",
    name: "Usage Details",
    description: "Usage details",
    internal: "usage_details",
  },
  {
    id: "costDetails",
    name: "Cost Details",
    description: "Cost details",
    internal: "cost_details",
  },
];

describe("extractObservationVariables", () => {
  const mockObservation: ObservationForEval = {
    // Core identifiers
    span_id: "obs-123",
    trace_id: "trace-456",
    project_id: "project-789",
    parent_span_id: null,

    // Observation properties
    type: "GENERATION",
    name: "chat-completion",
    environment: "production",
    level: "DEFAULT",
    status_message: null,
    version: "v1.0",

    // Trace-level properties
    trace_name: "my-trace",
    user_id: "user-abc",
    session_id: "session-xyz",
    tags: ["tag1", "tag2"],
    release: "v2.0.0",

    // Model properties
    provided_model_name: "gpt-4",
    model_parameters: '{"temperature": 0.7}',

    // Prompt properties
    prompt_id: null,
    prompt_name: null,
    prompt_version: null,

    // Tool call properties
    tool_definitions: { search: '{"description": "Search the web"}' },
    // Real storage shape: name-less JSON strings, names in the parallel array.
    tool_calls: [
      '{"id":"call_1","arguments":"{\\"query\\":\\"test\\"}","type":"function","index":0}',
    ],
    tool_call_names: ["search"],
    tool_call_count: 1,

    // Usage & Cost
    usage_details: { input: 100, output: 50 },
    cost_details: {},
    provided_usage_details: {},
    provided_cost_details: {},

    // Experiment properties
    experiment_id: null,
    experiment_name: null,
    experiment_description: null,
    experiment_dataset_id: null,
    experiment_item_id: null,
    experiment_item_expected_output: "expected response",
    experiment_item_metadata: { cohort: "control", region: "eu" },

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

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("input");
      expect(result[0].value).toEqual({
        prompt: "Hello, how are you?",
        context: "greeting",
      });
    });

    it("should extract output variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "output", selectedColumnId: "output" },
      ];

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("output");
      expect(result[0].value).toEqual({
        response: "I am fine, thank you!",
        sentiment: "positive",
      });
    });

    it("should extract metadata variable as JSON string", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "meta", selectedColumnId: "metadata" },
      ];

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("meta");
      expect(result[0].value).toEqual(mockObservation.metadata);
    });

    it("should extract multiple variables", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "userInput", selectedColumnId: "input" },
        { templateVariable: "modelOutput", selectedColumnId: "output" },
        { templateVariable: "metadata", selectedColumnId: "metadata" },
      ];

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      expect(result).toHaveLength(3);
      expect(result[0].var).toBe("userInput");
      expect(result[0].value).toEqual({
        prompt: "Hello, how are you?",
        context: "greeting",
      });
      expect(result[1].var).toBe("modelOutput");
      expect(result[1].value).toEqual({
        response: "I am fine, thank you!",
        sentiment: "positive",
      });
      expect(result[2].var).toBe("metadata");
    });
  });

  describe("tool call extraction", () => {
    it("should extract toolCalls as zipped objects with the default columns", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "tools", selectedColumnId: "toolCalls" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("tools");
      expect(result[0].value).toEqual([
        {
          id: "call_1",
          name: "search",
          arguments: { query: "test" },
          type: "function",
          index: 0,
        },
      ]);
    });

    it("passes string argument values through unchanged", () => {
      // Zipped calls skip deepParseJson entirely (arguments are already parsed
      // by the zip), so JSON-literal strings the model emitted ("true", "42",
      // serialized objects) are NOT coerced. This pins the payload types
      // evaluator code receives.
      const args = JSON.stringify({
        count: "42",
        flag: "true",
        nested: '{"a":1}',
      });
      const observation = {
        ...mockObservation,
        tool_calls: [
          JSON.stringify({
            id: "call_1",
            arguments: args,
            type: "function",
            index: 0,
          }),
        ],
        tool_call_names: ["search"],
      };

      const result = extractObservationVariables({
        observation,
        variableMapping: [
          { templateVariable: "tools", selectedColumnId: "toolCalls" },
        ],
      });

      expect(result[0].value).toEqual([
        {
          id: "call_1",
          name: "search",
          arguments: {
            count: "42",
            flag: "true",
            nested: '{"a":1}',
          },
          type: "function",
          index: 0,
        },
      ]);
    });

    it("keeps JSON-literal id/name/type strings as strings", () => {
      // A tool named "null" (or an id/type of "true"/"false") is unusual but
      // legal. deepParseJson would coerce these top-level fields to primitives
      // at depth 2 — which then fails buildCodeEvalPayload's schema parse and
      // empties the whole array, or leaks null/true into judge prompts.
      const observation = {
        ...mockObservation,
        tool_calls: [
          JSON.stringify({
            id: "true",
            arguments: "{}",
            type: "false",
            index: 0,
          }),
        ],
        tool_call_names: ["null"],
      };

      const result = extractObservationVariables({
        observation,
        variableMapping: [
          { templateVariable: "tools", selectedColumnId: "toolCalls" },
        ],
      });

      expect(result[0].value).toEqual([
        {
          id: "true",
          name: "null",
          arguments: {},
          type: "false",
          index: 0,
        },
      ]);
    });

    it("should support JSONPath selectors over zipped toolCalls", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "calledTools",
          selectedColumnId: "toolCalls",
          jsonSelector: "$[*].name",
        },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].value).toEqual("search");
    });

    it("should extract toolDefinitions variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "definitions",
          selectedColumnId: "toolDefinitions",
        },
      ];

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("definitions");
      expect(result[0].value).toEqual(mockObservation.tool_definitions);
    });
  });

  describe("model extraction", () => {
    it("should extract model variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "modelName",
          selectedColumnId: "providedModelName",
        },
      ];

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("modelName");
      expect(result[0].value).toBe("gpt-4");
    });

    it("should extract modelParameters variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "params", selectedColumnId: "modelParameters" },
      ];

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("params");
      expect(result[0].value).toEqual({ temperature: 0.7 });
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

    it("should extract experimentItemMetadata variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "item_metadata",
          selectedColumnId: "experimentItemMetadata",
        },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("item_metadata");
      expect(result[0].value).toEqual(mockObservation.experiment_item_metadata);
    });
  });

  describe("usage extraction", () => {
    it("should extract usageDetails variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "usage", selectedColumnId: "usageDetails" },
      ];

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("usage");
      expect(result[0].value).toEqual(mockObservation.usage_details);
    });

    it("should extract costDetails variable", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "cost", selectedColumnId: "costDetails" },
      ];

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      expect(result).toHaveLength(1);
      expect(result[0].var).toBe("cost");
      expect(result[0].value).toEqual(mockObservation.cost_details);
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

      // Single-match results are unwrapped
      expect(result[0].value).toBe("Hello, how are you?");
    });

    it("should apply JSON selector to extract nested field from output", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "response",
          selectedColumnId: "output",
          jsonSelector: "$.response",
        },
      ];

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      // Single-match results are unwrapped
      expect(result[0].value).toBe("I am fine, thank you!");
    });

    it("should apply JSON selector to extract nested field from experiment item metadata", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "cohort",
          selectedColumnId: "experimentItemMetadata",
          jsonSelector: "$.cohort",
        },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result[0].value).toBe("control");
    });

    // OTel ingestion stringifies metadata.attributes.* values; ingestion stringifies the whole metadata.attributes object
    it("should extract names from stringified metadata.attributes.tools array", () => {
      const observationWithStringifiedTools: ObservationForEval = {
        ...mockObservation,
        metadata: {
          attributes: {
            tools: JSON.stringify([
              { name: "get_weather" },
              { name: "search_web" },
            ]),
          },
        },
      };

      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "toolNames",
          selectedColumnId: "metadata",
          jsonSelector: "$.attributes.tools[*].name",
        },
      ];

      const result = extractObservationVariables({
        observation: observationWithStringifiedTools,
        variableMapping,
      });

      expect(result[0].value).toEqual(["get_weather", "search_web"]);
    });

    it("should handle null jsonSelector by returning full parsed value", () => {
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

      expect(result[0].value).toEqual({
        prompt: "Hello, how are you?",
        context: "greeting",
      });
    });

    it("should handle undefined jsonSelector by returning full parsed value", () => {
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

      expect(result[0].value).toEqual({
        prompt: "Hello, how are you?",
        context: "greeting",
      });
    });

    it("keeps parsed value for no-selector mapping when selector sibling uses the same JSON string column", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "rawInput",
          selectedColumnId: "input",
        },
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

      expect(result).toEqual([
        {
          var: "rawInput",
          value: {
            prompt: "Hello, how are you?",
            context: "greeting",
          },
        },
        { var: "prompt", value: "Hello, how are you?" },
      ]);
    });

    it("deep-parses mapped values without coercing numeric strings", () => {
      const observationWithNestedJson: ObservationForEval = {
        ...mockObservation,
        input: JSON.stringify({
          question: "2+2",
          nested: JSON.stringify({ answer: 4 }),
          num: "42",
        }),
        output: "true",
        experiment_item_expected_output: "null",
      };

      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "input", selectedColumnId: "input" },
        { templateVariable: "output", selectedColumnId: "output" },
        {
          templateVariable: "expected",
          selectedColumnId: "experimentItemExpectedOutput",
        },
      ];

      const result = extractObservationVariables({
        observation: observationWithNestedJson,
        variableMapping,
      });

      expect(result).toEqual([
        {
          var: "input",
          value: { question: "2+2", nested: { answer: 4 }, num: "42" },
        },
        { var: "output", value: true },
        { var: "expected", value: null },
      ]);
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

      const result = extractObservationVariables(
        {
          observation: observationWithNulls,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      expect(result[0].value).toBeNull();
      expect(result[1].value).toBeUndefined();
    });

    it("should handle invalid JSON selector gracefully", () => {
      const variableMapping: ObservationVariableMapping[] = [
        {
          templateVariable: "field",
          selectedColumnId: "input",
          jsonSelector: "$.nonexistent.deeply.nested",
        },
      ];

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      // Non-matching JSONPath returns undefined
      expect(result[0].value).toBeUndefined();
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

      const result = extractObservationVariables(
        {
          observation: observationWithPlainText,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      // Should fall back to original value when JSON parsing fails
      expect(result[0].value).toBe("plain text, not JSON");
    });
  });

  describe("column ID mapping", () => {
    it("should map 'input' to observation input field", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "var", selectedColumnId: "input" },
      ];

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      expect(result[0].value).toEqual({
        prompt: "Hello, how are you?",
        context: "greeting",
      });
    });

    it("should map 'output' to observation output field", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "var", selectedColumnId: "output" },
      ];

      const result = extractObservationVariables(
        {
          observation: mockObservation,
          variableMapping,
        },
        availableObservationEvalVariableColumns as ObservationEvalVariableColumn[],
      );

      expect(result[0].value).toEqual({
        response: "I am fine, thank you!",
        sentiment: "positive",
      });
    });

    it("should map 'metadata' to observation metadata field as JSON string", () => {
      const variableMapping: ObservationVariableMapping[] = [
        { templateVariable: "var", selectedColumnId: "metadata" },
      ];

      const result = extractObservationVariables({
        observation: mockObservation,
        variableMapping,
      });

      expect(result[0].value).toEqual(mockObservation.metadata);
    });
  });
});
