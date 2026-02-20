import { describe, it, expect } from "vitest";
import {
  applyFieldMappingConfig,
  applyFullMapping,
  evaluateJsonPath,
  isJsonPath,
  testJsonPath,
  generateJsonPathSuggestions,
} from "@langfuse/shared";

describe("applyFieldMapping", () => {
  // Sample observation data for testing
  const sampleObservation = {
    input: {
      messages: [
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: "What is 2+2?" },
      ],
      model: "gpt-4",
      temperature: 0.7,
    },
    output: {
      choices: [{ message: { role: "assistant", content: "4" } }],
      usage: { total_tokens: 50 },
    },
    metadata: {
      user_id: "user-123",
      session_id: "session-456",
      tags: ["math", "simple", "hello"],
    },
  };

  describe("isJsonPath", () => {
    it("should return true for strings starting with $", () => {
      expect(isJsonPath("$")).toBe(true);
      expect(isJsonPath("$.field")).toBe(true);
      expect(isJsonPath("$.nested.path")).toBe(true);
      expect(isJsonPath("$[0]")).toBe(true);
    });

    it("should return false for strings not starting with $", () => {
      expect(isJsonPath("field")).toBe(false);
      expect(isJsonPath("")).toBe(false);
      expect(isJsonPath("literal value")).toBe(false);
      expect(isJsonPath(" $")).toBe(false);
    });
  });

  describe("testJsonPath", () => {
    it("should return success for valid JSON paths", () => {
      const result = testJsonPath({
        jsonPath: "$.messages[0].content",
        data: sampleObservation.input,
      });
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should return success for root path", () => {
      const result = testJsonPath({
        jsonPath: "$",
        data: sampleObservation.input,
      });
      expect(result.success).toBe(true);
    });

    it("should handle string data (auto-parse JSON)", () => {
      const result = testJsonPath({
        jsonPath: "$.key",
        data: '{"key": "value"}',
      });
      expect(result.success).toBe(true);
    });
  });

  describe("evaluateJsonPath", () => {
    it("should return the full object if on root '$' and object is string", () => {
      const result = evaluateJsonPath("Hello", "$");
      expect(result).toBe("Hello");
    });

    it("should extract nested values using JSON path", () => {
      expect(
        evaluateJsonPath(sampleObservation.input, "$.messages[0].content"),
      ).toBe("You are a helpful assistant");

      expect(
        evaluateJsonPath(sampleObservation.input, "$.messages[1].content"),
      ).toBe("What is 2+2?");
    });

    it("should return the root object for $ path", () => {
      const result = evaluateJsonPath(sampleObservation.input, "$");
      expect(result).toEqual(sampleObservation.input);
    });

    it("should extract simple fields", () => {
      expect(evaluateJsonPath(sampleObservation.input, "$.model")).toBe(
        "gpt-4",
      );
      expect(evaluateJsonPath(sampleObservation.input, "$.temperature")).toBe(
        0.7,
      );
    });

    it("should return undefined for non-existent paths", () => {
      expect(
        evaluateJsonPath(sampleObservation.input, "$.nonExistent"),
      ).toBeUndefined();
      expect(
        evaluateJsonPath(sampleObservation.input, "$.messages[99]"),
      ).toBeUndefined();
    });

    it("should handle string data (auto-parse JSON)", () => {
      const jsonString = '{"nested": {"value": 42}}';
      expect(evaluateJsonPath(jsonString, "$.nested.value")).toBe(42);
    });

    it("should return undefined for invalid JSON paths gracefully", () => {
      expect(
        evaluateJsonPath(sampleObservation.input, "invalid"),
      ).toBeUndefined();
    });

    it("should extract array elements", () => {
      expect(evaluateJsonPath(sampleObservation.metadata, "$.tags[0]")).toBe(
        "math",
      );
      expect(evaluateJsonPath(sampleObservation.metadata, "$.tags[1]")).toBe(
        "simple",
      );
      expect(
        evaluateJsonPath(sampleObservation.metadata, "$.tags[1:]"),
      ).toEqual(["simple", "hello"]);
    });
  });

  describe("applyFieldMappingConfig - full mode", () => {
    it("should return full source field for 'full' mode", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: { mode: "full" },
        defaultSourceField: "input",
      });

      expect(result).toEqual(sampleObservation.input);
    });

    it("should return full output for 'full' mode with output as default", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: { mode: "full" },
        defaultSourceField: "output",
      });

      expect(result).toEqual(sampleObservation.output);
    });

    it("should return full metadata for 'full' mode with metadata as default", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: { mode: "full" },
        defaultSourceField: "metadata",
      });

      expect(result).toEqual(sampleObservation.metadata);
    });
  });

  describe("applyFieldMappingConfig - none mode", () => {
    it("should return null for 'none' mode", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: { mode: "none" },
        defaultSourceField: "input",
      });

      expect(result).toBeNull();
    });
  });

  describe("applyFieldMappingConfig - custom root mode", () => {
    it("should extract value using JSON path in root mode", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "root",
            rootConfig: {
              sourceField: "input",
              jsonPath: "$.messages[1].content",
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toBe("What is 2+2?");
    });

    it("should allow extracting from different source field", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "root",
            rootConfig: {
              sourceField: "output",
              jsonPath: "$.choices[0].message.content",
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toBe("4");
    });

    it("should return undefined for non-existent path", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "root",
            rootConfig: {
              sourceField: "input",
              jsonPath: "$.nonExistent.path",
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toBeUndefined();
    });

    it("should fallback to default source field if no custom config", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "root",
          },
        },
        defaultSourceField: "metadata",
      });

      expect(result).toEqual(sampleObservation.metadata);
    });
  });

  describe("applyFieldMappingConfig - custom keyValueMap mode (flat keys)", () => {
    it("should build object from key-value entries with JSON paths", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries: [
                {
                  id: "1",
                  key: "prompt",
                  sourceField: "input",
                  value: "$.messages[1].content",
                },
                {
                  id: "2",
                  key: "response",
                  sourceField: "output",
                  value: "$.choices[0].message.content",
                },
              ],
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toEqual({
        prompt: "What is 2+2?",
        response: "4",
      });
    });

    it("should handle literal string values (not starting with $)", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries: [
                {
                  id: "1",
                  key: "type",
                  sourceField: "input",
                  value: "conversation",
                },
                {
                  id: "2",
                  key: "version",
                  sourceField: "input",
                  value: "1.0",
                },
              ],
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toEqual({
        type: "conversation",
        version: "1.0",
      });
    });

    it("should mix JSON paths and literal values", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries: [
                {
                  id: "1",
                  key: "prompt",
                  sourceField: "input",
                  value: "$.messages[1].content",
                },
                {
                  id: "2",
                  key: "category",
                  sourceField: "input",
                  value: "math",
                },
                {
                  id: "3",
                  key: "user",
                  sourceField: "metadata",
                  value: "$.user_id",
                },
              ],
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toEqual({
        prompt: "What is 2+2?",
        category: "math",
        user: "user-123",
      });
    });
  });

  describe("applyFieldMappingConfig - custom keyValueMap mode (dot notation / nested keys)", () => {
    it("should build nested objects using dot notation keys", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries: [
                {
                  id: "1",
                  key: "context.user_id",
                  sourceField: "metadata",
                  value: "$.user_id",
                },
                {
                  id: "2",
                  key: "context.session_id",
                  sourceField: "metadata",
                  value: "$.session_id",
                },
              ],
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toEqual({
        context: {
          user_id: "user-123",
          session_id: "session-456",
        },
      });
    });

    it("should handle deeply nested dot notation", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries: [
                {
                  id: "1",
                  key: "a.b.c.d",
                  sourceField: "input",
                  value: "$.model",
                },
              ],
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toEqual({
        a: {
          b: {
            c: {
              d: "gpt-4",
            },
          },
        },
      });
    });

    it("should merge multiple nested paths under the same parent", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries: [
                {
                  id: "1",
                  key: "prompt",
                  sourceField: "input",
                  value: "$.messages[1].content",
                },
                {
                  id: "2",
                  key: "context.user_id",
                  sourceField: "metadata",
                  value: "$.user_id",
                },
                {
                  id: "3",
                  key: "context.session_id",
                  sourceField: "metadata",
                  value: "$.session_id",
                },
                {
                  id: "4",
                  key: "model_info.name",
                  sourceField: "input",
                  value: "$.model",
                },
                {
                  id: "5",
                  key: "model_info.temperature",
                  sourceField: "input",
                  value: "$.temperature",
                },
              ],
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toEqual({
        prompt: "What is 2+2?",
        context: {
          user_id: "user-123",
          session_id: "session-456",
        },
        model_info: {
          name: "gpt-4",
          temperature: 0.7,
        },
      });
    });

    it("should handle mix of flat and nested keys", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries: [
                {
                  id: "1",
                  key: "prompt",
                  sourceField: "input",
                  value: "$.messages[1].content",
                },
                {
                  id: "2",
                  key: "context.user",
                  sourceField: "metadata",
                  value: "$.user_id",
                },
                {
                  id: "3",
                  key: "version",
                  sourceField: "input",
                  value: "1.0",
                },
              ],
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toEqual({
        prompt: "What is 2+2?",
        context: {
          user: "user-123",
        },
        version: "1.0",
      });
    });

    it("should handle literal values with dot notation keys", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries: [
                {
                  id: "1",
                  key: "settings.theme",
                  sourceField: "input",
                  value: "dark",
                },
                {
                  id: "2",
                  key: "settings.language",
                  sourceField: "input",
                  value: "en",
                },
              ],
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toEqual({
        settings: {
          theme: "dark",
          language: "en",
        },
      });
    });

    it("should skip entries with empty/falsy values except empty string", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries: [
                {
                  id: "1",
                  key: "prompt",
                  sourceField: "input",
                  value: "$.messages[1].content",
                },
                {
                  id: "2",
                  key: "empty_string",
                  sourceField: "input",
                  value: "", // Empty string should be included
                },
              ],
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toEqual({
        prompt: "What is 2+2?",
        empty_string: "",
      });
    });

    it("should overwrite parent if nested key comes after flat key with same prefix", () => {
      // This tests the edge case where a flat key is set first, then a nested key tries to use it
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries: [
                {
                  id: "1",
                  key: "context",
                  sourceField: "input",
                  value: "some-value",
                },
                {
                  id: "2",
                  key: "context.nested",
                  sourceField: "input",
                  value: "nested-value",
                },
              ],
            },
          },
        },
        defaultSourceField: "input",
      });

      // The nested key should overwrite the flat value
      expect(result).toEqual({
        context: {
          nested: "nested-value",
        },
      });
    });
  });

  describe("applyFullMapping", () => {
    it("should apply mapping to all three fields", () => {
      const result = applyFullMapping({
        observation: sampleObservation,
        mapping: {
          input: {
            mode: "custom",
            custom: {
              type: "keyValueMap",
              keyValueMapConfig: {
                entries: [
                  {
                    id: "1",
                    key: "prompt",
                    sourceField: "input",
                    value: "$.messages[1].content",
                  },
                ],
              },
            },
          },
          expectedOutput: {
            mode: "custom",
            custom: {
              type: "root",
              rootConfig: {
                sourceField: "output",
                jsonPath: "$.choices[0].message.content",
              },
            },
          },
          metadata: { mode: "none" },
        },
      });

      expect(result).toEqual({
        input: { prompt: "What is 2+2?" },
        expectedOutput: "4",
        metadata: null,
        errors: [],
      });
    });

    it("should apply full mode for all fields", () => {
      const result = applyFullMapping({
        observation: sampleObservation,
        mapping: {
          input: { mode: "full" },
          expectedOutput: { mode: "full" },
          metadata: { mode: "full" },
        },
      });

      expect(result).toEqual({
        input: sampleObservation.input,
        expectedOutput: sampleObservation.output,
        metadata: sampleObservation.metadata,
        errors: [],
      });
    });

    it("should handle schema-compliant mapping with nested keys", () => {
      // Simulates mapping for a schema like:
      // { prompt: string, context: { user_id: string, session_id: string } }
      const result = applyFullMapping({
        observation: sampleObservation,
        mapping: {
          input: {
            mode: "custom",
            custom: {
              type: "keyValueMap",
              keyValueMapConfig: {
                entries: [
                  {
                    id: "1",
                    key: "prompt",
                    sourceField: "input",
                    value: "$.messages[1].content",
                  },
                  {
                    id: "2",
                    key: "context.user_id",
                    sourceField: "metadata",
                    value: "$.user_id",
                  },
                  {
                    id: "3",
                    key: "context.session_id",
                    sourceField: "metadata",
                    value: "$.session_id",
                  },
                ],
              },
            },
          },
          expectedOutput: {
            mode: "custom",
            custom: {
              type: "root",
              rootConfig: {
                sourceField: "output",
                jsonPath: "$.choices[0].message.content",
              },
            },
          },
          metadata: { mode: "none" },
        },
      });

      expect(result).toEqual({
        input: {
          prompt: "What is 2+2?",
          context: {
            user_id: "user-123",
            session_id: "session-456",
          },
        },
        expectedOutput: "4",
        metadata: null,
        errors: [],
      });
    });

    it("should collect json_path_miss errors for non-matching root paths", () => {
      const result = applyFullMapping({
        observation: sampleObservation,
        mapping: {
          input: {
            mode: "custom",
            custom: {
              type: "root",
              rootConfig: {
                sourceField: "input",
                jsonPath: "$.nonExistent.deeply.nested",
              },
            },
          },
          expectedOutput: { mode: "full" },
          metadata: { mode: "none" },
        },
      });

      expect(result.input).toBeUndefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        type: "json_path_miss",
        targetField: "input",
        sourceField: "input",
        jsonPath: "$.nonExistent.deeply.nested",
        mappingKey: null,
      });
      expect(result.errors[0].message).toContain("did not match");
    });

    it("should collect json_path_miss errors for non-matching keyValueMap paths", () => {
      const result = applyFullMapping({
        observation: sampleObservation,
        mapping: {
          input: {
            mode: "custom",
            custom: {
              type: "keyValueMap",
              keyValueMapConfig: {
                entries: [
                  {
                    id: "1",
                    key: "prompt",
                    sourceField: "input",
                    value: "$.messages[1].content", // matches
                  },
                  {
                    id: "2",
                    key: "missing",
                    sourceField: "output",
                    value: "$.nonExistent", // does not match
                  },
                ],
              },
            },
          },
          expectedOutput: { mode: "full" },
          metadata: { mode: "none" },
        },
      });

      expect(result.input).toEqual({
        prompt: "What is 2+2?",
        missing: undefined,
      });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        type: "json_path_miss",
        targetField: "input",
        sourceField: "output",
        jsonPath: "$.nonExistent",
        mappingKey: "missing",
      });
    });

    it("should collect errors across multiple fields", () => {
      const result = applyFullMapping({
        observation: sampleObservation,
        mapping: {
          input: {
            mode: "custom",
            custom: {
              type: "root",
              rootConfig: {
                sourceField: "input",
                jsonPath: "$.nope",
              },
            },
          },
          expectedOutput: {
            mode: "custom",
            custom: {
              type: "root",
              rootConfig: {
                sourceField: "output",
                jsonPath: "$.alsoNope",
              },
            },
          },
          metadata: { mode: "none" },
        },
      });

      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].targetField).toBe("input");
      expect(result.errors[1].targetField).toBe("expectedOutput");
    });

    it("should not collect errors for literal string values in keyValueMap", () => {
      const result = applyFullMapping({
        observation: sampleObservation,
        mapping: {
          input: {
            mode: "custom",
            custom: {
              type: "keyValueMap",
              keyValueMapConfig: {
                entries: [
                  {
                    id: "1",
                    key: "type",
                    sourceField: "input",
                    value: "conversation", // literal, not JSON path
                  },
                ],
              },
            },
          },
          expectedOutput: { mode: "full" },
          metadata: { mode: "none" },
        },
      });

      expect(result.errors).toHaveLength(0);
      expect(result.input).toEqual({ type: "conversation" });
    });
  });

  describe("generateJsonPathSuggestions", () => {
    it("should generate suggestions for object properties", () => {
      const suggestions = generateJsonPathSuggestions({ a: 1, b: 2 });
      expect(suggestions).toContain("$.a");
      expect(suggestions).toContain("$.b");
    });

    it("should generate suggestions for nested objects", () => {
      const suggestions = generateJsonPathSuggestions({
        nested: { child: "value" },
      });
      expect(suggestions).toContain("$.nested");
      expect(suggestions).toContain("$.nested.child");
    });

    it("should generate suggestions for arrays", () => {
      const suggestions = generateJsonPathSuggestions({
        items: [{ name: "first" }],
      });
      expect(suggestions).toContain("$.items");
      expect(suggestions).toContain("$.items[0]");
      expect(suggestions).toContain("$.items[*]");
      expect(suggestions).toContain("$.items[0].name");
    });

    it("should return empty array for null/undefined", () => {
      expect(generateJsonPathSuggestions(null)).toEqual([]);
      expect(generateJsonPathSuggestions(undefined)).toEqual([]);
    });

    it("should handle complex nested structure", () => {
      const suggestions = generateJsonPathSuggestions(sampleObservation.input);
      expect(suggestions).toContain("$.messages");
      expect(suggestions).toContain("$.messages[0]");
      expect(suggestions).toContain("$.messages[0].role");
      expect(suggestions).toContain("$.messages[0].content");
      expect(suggestions).toContain("$.model");
      expect(suggestions).toContain("$.temperature");
    });
  });

  describe("edge cases", () => {
    it("should handle null observation fields", () => {
      const obsWithNull = {
        input: null,
        output: { value: "test" },
        metadata: null,
      };

      const result = applyFieldMappingConfig({
        observation: obsWithNull,
        config: { mode: "full" },
        defaultSourceField: "input",
      });

      expect(result).toBeNull();
    });

    it("should handle undefined paths gracefully", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries: [
                {
                  id: "1",
                  key: "nonexistent",
                  sourceField: "input",
                  value: "$.does.not.exist",
                },
              ],
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toEqual({
        nonexistent: undefined,
      });
    });

    it("should handle empty entries array by returning default source", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
          custom: {
            type: "keyValueMap",
            keyValueMapConfig: {
              entries: [],
            },
          },
        },
        defaultSourceField: "input",
      });

      expect(result).toEqual(sampleObservation.input);
    });

    it("should handle no custom config by returning default source", () => {
      const result = applyFieldMappingConfig({
        observation: sampleObservation,
        config: {
          mode: "custom",
        },
        defaultSourceField: "metadata",
      });

      expect(result).toEqual(sampleObservation.metadata);
    });
  });
});
