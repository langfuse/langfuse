import { describe, it, expect } from "vitest";
import {
  extractToolsFromObservation,
  ClickhouseToolDefinitionSchema,
  ClickhouseToolArgumentSchema,
  convertDefinitionsToMap,
  convertCallsToMap,
} from "@langfuse/shared/src/server";

describe("extractToolsFromObservation", () => {
  describe("Tool Definitions extraction", () => {
    it("extracts OpenAI format tools from input", () => {
      const input = {
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get current weather",
              parameters: {
                type: "object",
                properties: { location: { type: "string" } },
              },
            },
          },
        ],
      };

      const { toolDefinitions } = extractToolsFromObservation(input, null);

      expect(toolDefinitions).toHaveLength(1);
      expect(toolDefinitions[0]).toEqual({
        name: "get_weather",
        description: "Get current weather",
        parameters: JSON.stringify({
          type: "object",
          properties: { location: { type: "string" } },
        }),
      });
    });

    it("extracts tools from messages array", () => {
      const input = {
        messages: [
          {
            role: "user",
            content: "test",
            tools: [
              {
                name: "search",
                description: "Search database",
              },
            ],
          },
        ],
      };

      const { toolDefinitions } = extractToolsFromObservation(input, null);

      expect(toolDefinitions).toHaveLength(1);
      expect(toolDefinitions[0].name).toBe("search");
    });

    it("extracts tools from OTel metadata attributes", () => {
      const metadata = {
        attributes: {
          "gen_ai.tool.definitions": [
            {
              name: "calculator",
              description: "Do math",
              parameters: { type: "object" },
            },
          ],
        },
      };

      const { toolDefinitions } = extractToolsFromObservation(
        null,
        null,
        metadata,
      );

      expect(toolDefinitions).toHaveLength(1);
      expect(toolDefinitions[0].name).toBe("calculator");
    });

    it("extracts tools from OTel indexed format", () => {
      const metadata = {
        attributes: {
          "llm.tools.0.tool.json_schema": {
            name: "tool1",
            description: "First tool",
          },
          "llm.tools.1.tool.json_schema": {
            name: "tool2",
            description: "Second tool",
          },
        },
      };

      const { toolDefinitions } = extractToolsFromObservation(
        null,
        null,
        metadata,
      );

      expect(toolDefinitions).toHaveLength(2);
      expect(toolDefinitions.map((t) => t.name)).toEqual(["tool1", "tool2"]);
    });

    it("returns empty array for input without tools", () => {
      const input = { messages: [{ role: "user", content: "hi" }] };

      const { toolDefinitions } = extractToolsFromObservation(input, null);

      expect(toolDefinitions).toEqual([]);
    });

    it("deduplicates tools by name", () => {
      const input = {
        messages: [
          { tools: [{ name: "search" }] },
          { tools: [{ name: "search" }] }, // duplicate
        ],
      };

      const { toolDefinitions } = extractToolsFromObservation(input, null);

      expect(toolDefinitions).toHaveLength(1);
    });
  });

  describe("Tool Arguments extraction", () => {
    it("extracts flat tool_calls from output", () => {
      const output = {
        tool_calls: [
          {
            id: "call_123",
            name: "get_weather",
            arguments: '{"location": "Boston"}',
            type: "function",
            index: 0,
          },
        ],
      };

      const { toolArguments } = extractToolsFromObservation(null, output);

      expect(toolArguments).toHaveLength(1);
      expect(toolArguments[0]).toEqual({
        id: "call_123",
        name: "get_weather",
        arguments: '{"location": "Boston"}',
        type: "function",
        index: 0,
      });
    });

    it("extracts tool_calls from OpenAI choices response", () => {
      const output = {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  id: "call_abc",
                  type: "function",
                  function: {
                    name: "search",
                    arguments: '{"query": "test"}',
                  },
                },
              ],
            },
          },
        ],
      };

      const { toolArguments } = extractToolsFromObservation(null, output);

      expect(toolArguments).toHaveLength(1);
      expect(toolArguments[0]).toMatchObject({
        id: "call_abc",
        name: "search",
        arguments: '{"query": "test"}',
        type: "function",
      });
    });

    it("extracts Anthropic tool_use from content array", () => {
      const output = {
        content: [
          {
            type: "tool_use",
            id: "toolu_123",
            name: "get_weather",
            input: { location: "NYC" },
          },
        ],
      };

      const { toolArguments } = extractToolsFromObservation(null, output);

      expect(toolArguments).toHaveLength(1);
      expect(toolArguments[0]).toEqual({
        id: "toolu_123",
        name: "get_weather",
        arguments: JSON.stringify({ location: "NYC" }),
        type: "tool_use",
      });
    });

    it("extracts LangChain additional_kwargs tool_calls", () => {
      const output = {
        additional_kwargs: {
          tool_calls: [
            {
              id: "call_xyz",
              name: "calculator",
              arguments: { operation: "add" },
            },
          ],
        },
      };

      const { toolArguments } = extractToolsFromObservation(null, output);

      expect(toolArguments).toHaveLength(1);
      expect(toolArguments[0].name).toBe("calculator");
      expect(toolArguments[0].arguments).toBe(
        JSON.stringify({ operation: "add" }),
      );
    });

    it("extracts from array of messages with tool_calls", () => {
      const output = [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          tool_calls: [{ id: "c1", name: "tool1", arguments: "{}" }],
        },
      ];

      const { toolArguments } = extractToolsFromObservation(null, output);

      expect(toolArguments).toHaveLength(1);
      expect(toolArguments[0].name).toBe("tool1");
    });

    it("handles Vercel AI SDK format (toolCallId, toolName, args)", () => {
      const output = {
        tool_calls: [
          {
            toolCallId: "call_123",
            toolName: "search",
            args: { query: "test" },
          },
        ],
      };

      const { toolArguments } = extractToolsFromObservation(null, output);

      expect(toolArguments).toHaveLength(1);
      expect(toolArguments[0]).toMatchObject({
        id: "call_123",
        name: "search",
        arguments: JSON.stringify({ query: "test" }),
      });
    });

    it("preserves index field for parallel tool calls", () => {
      const output = {
        tool_calls: [
          { id: "c1", name: "tool1", arguments: "{}", index: 0 },
          { id: "c2", name: "tool2", arguments: "{}", index: 1 },
        ],
      };

      const { toolArguments } = extractToolsFromObservation(null, output);

      expect(toolArguments).toHaveLength(2);
      expect(toolArguments[0].index).toBe(0);
      expect(toolArguments[1].index).toBe(1);
    });

    it("returns empty array for output without tool_calls", () => {
      const output = { role: "assistant", content: "Hello" };

      const { toolArguments } = extractToolsFromObservation(null, output);

      expect(toolArguments).toEqual([]);
    });
  });

  describe("Error handling", () => {
    it("returns empty arrays on malformed input (no throw)", () => {
      const malformed = { tools: "not an array" };

      expect(() => extractToolsFromObservation(malformed, null)).not.toThrow();

      const result = extractToolsFromObservation(malformed, null);
      expect(result.toolDefinitions).toEqual([]);
    });

    it("handles null/undefined gracefully", () => {
      const result = extractToolsFromObservation(null, undefined);

      expect(result.toolDefinitions).toEqual([]);
      expect(result.toolArguments).toEqual([]);
    });

    it("handles circular references gracefully", () => {
      const circular: any = { tools: [] };
      circular.tools.push(circular);

      expect(() => extractToolsFromObservation(circular, null)).not.toThrow();
    });

    it("filters out invalid tool definitions (missing name)", () => {
      const input = {
        tools: [
          { function: { name: "valid_tool" } },
          { function: { description: "no name" } }, // invalid
        ],
      };

      const { toolDefinitions } = extractToolsFromObservation(input, null);

      expect(toolDefinitions).toHaveLength(1);
      expect(toolDefinitions[0].name).toBe("valid_tool");
    });

    it("filters out invalid tool calls (missing name)", () => {
      const output = {
        tool_calls: [
          { id: "c1", name: "valid_call", arguments: "{}" },
          { id: "c2", arguments: "{}" }, // invalid - no name
        ],
      };

      const { toolArguments } = extractToolsFromObservation(null, output);

      expect(toolArguments).toHaveLength(1);
      expect(toolArguments[0].name).toBe("valid_call");
    });
  });

  describe("Combined extraction", () => {
    it("extracts both definitions and arguments in single call", () => {
      const input = {
        tools: [{ name: "calculator", description: "Do math" }],
      };
      const output = {
        tool_calls: [{ id: "c1", name: "calculator", arguments: "{}" }],
      };

      const result = extractToolsFromObservation(input, output);

      expect(result.toolDefinitions).toHaveLength(1);
      expect(result.toolArguments).toHaveLength(1);
      expect(result.toolDefinitions[0].name).toBe("calculator");
      expect(result.toolArguments[0].name).toBe("calculator");
    });
  });

  describe("real world data tests", () => {
    it("should extract tools from OpenAI format (tools in input.tools)", () => {
      const input = {
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get current weather",
              parameters: {
                type: "object",
                properties: { location: { type: "string" } },
                required: ["location"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "search_web",
              description: "Search",
            },
          },
        ],
        messages: [{ role: "user", content: "Weather in NYC?" }],
      };

      const output = {
        model: "gpt-4",
        choices: [
          {
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"location":"NYC"}',
                  },
                },
              ],
            },
          },
        ],
      };

      const result = extractToolsFromObservation(input, output, undefined);

      expect(result.toolDefinitions).toHaveLength(2);
      expect(result.toolDefinitions.map((t) => t.name)).toEqual([
        "get_weather",
        "search_web",
      ]);
      expect(result.toolArguments).toHaveLength(1);
      expect(result.toolArguments[0].name).toBe("get_weather");
      expect(result.toolArguments[0].id).toBe("call_123");
      expect(result.toolArguments[0].arguments).toBe('{"location":"NYC"}');
    });

    it("should extract tool definitions from OTel metadata structure i.e. pydantic-ai", () => {
      const metadata = {
        attributes: {
          "gen_ai.operation.name": "chat",
          "gen_ai.system": "openai",
          "gen_ai.request.model": "gpt-4o-mini",
          model_request_parameters: {
            function_tools: [
              {
                name: "get_pun_suggestion",
                parameters_json_schema: {
                  type: "object",
                  properties: { topic: { type: "string" } },
                  required: ["topic"],
                },
                description:
                  "Get a pun-style joke suggestion for the given topic.",
              },
              {
                name: "get_dad_joke_suggestion",
                parameters_json_schema: {
                  type: "object",
                  properties: { topic: { type: "string" } },
                },
                description:
                  "Get a dad joke style suggestion for the given topic.",
              },
              {
                name: "get_one_liner_suggestion",
                description:
                  "Get a one-liner joke suggestion for the given topic.",
              },
            ],
          },
        },
        scope: {
          name: "pydantic-ai",
          version: "1.26.0",
        },
      };

      const input = [
        {
          role: "system",
          parts: [{ type: "text", content: "You are a creative joke writer." }],
        },
        {
          role: "user",
          parts: [
            { type: "text", content: "Tell me a joke about programming." },
          ],
        },
      ];

      const output = {
        role: "assistant",
        tool_calls: [
          {
            id: "call_1",
            name: "get_pun_suggestion",
            arguments: '{"topic":"programming"}',
          },
          {
            id: "call_2",
            name: "get_dad_joke_suggestion",
            arguments: '{"topic":"programming"}',
          },
        ],
      };

      // Also test with explicit framework hint
      const result = extractToolsFromObservation(input, output, metadata);

      // Should extract 3 available tools
      expect(result.toolDefinitions).toHaveLength(3);
      expect(result.toolDefinitions.map((t) => t.name)).toEqual([
        "get_pun_suggestion",
        "get_dad_joke_suggestion",
        "get_one_liner_suggestion",
      ]);

      // Should extract 2 called tools
      expect(result.toolArguments).toHaveLength(2);
      expect(result.toolArguments.map((t) => t.name)).toEqual([
        "get_pun_suggestion",
        "get_dad_joke_suggestion",
      ]);
    });
  });

  describe("Transformation functions", () => {
    describe("convertDefinitionsToMap", () => {
      it("converts array to map format", () => {
        const defs = [
          { name: "get_weather", description: "Get weather", parameters: "{}" },
          { name: "search", description: "Search" },
        ];
        const map = convertDefinitionsToMap(defs);

        expect(Object.keys(map)).toEqual(["get_weather", "search"]);
        expect(JSON.parse(map["get_weather"])).toEqual({
          description: "Get weather",
          parameters: "{}",
        });
        expect(JSON.parse(map["search"])).toEqual({
          description: "Search",
          parameters: "",
        });
      });

      it("returns empty map for empty array", () => {
        expect(convertDefinitionsToMap([])).toEqual({});
      });

      it("handles missing optional fields with empty strings", () => {
        const defs = [{ name: "test_tool" }];
        const map = convertDefinitionsToMap(defs);

        expect(JSON.parse(map["test_tool"])).toEqual({
          description: "",
          parameters: "",
        });
      });
    });

    describe("convertCallsToMap", () => {
      it("groups calls by tool name", () => {
        const calls = [
          {
            id: "c1",
            name: "get_weather",
            arguments: '{"city":"NYC"}',
            type: "function",
            index: 0,
          },
          {
            id: "c2",
            name: "search",
            arguments: '{"q":"test"}',
            type: "function",
            index: 1,
          },
          {
            id: "c3",
            name: "get_weather",
            arguments: '{"city":"LA"}',
            type: "function",
            index: 2,
          },
        ];
        const map = convertCallsToMap(calls);

        expect(Object.keys(map).sort()).toEqual(["get_weather", "search"]);
        expect(map["get_weather"]).toHaveLength(2);
        expect(map["search"]).toHaveLength(1);

        // Verify JSON structure
        const call1 = JSON.parse(map["get_weather"][0]);
        expect(call1).toEqual({
          id: "c1",
          arguments: '{"city":"NYC"}',
          type: "function",
          index: 0,
        });
      });

      it("returns empty map for empty array", () => {
        expect(convertCallsToMap([])).toEqual({});
      });

      it("handles missing optional fields with defaults", () => {
        const calls = [{ id: "c1", name: "test_tool", arguments: "" }];
        const map = convertCallsToMap(calls);

        const call = JSON.parse(map["test_tool"][0]);
        expect(call).toEqual({
          id: "c1",
          arguments: "",
          type: "",
          index: 0,
        });
      });

      it("groups multiple calls to same tool", () => {
        const calls = [
          {
            id: "c1",
            name: "tool1",
            arguments: "{}",
            type: "function",
            index: 0,
          },
          {
            id: "c2",
            name: "tool1",
            arguments: "{}",
            type: "function",
            index: 1,
          },
          {
            id: "c3",
            name: "tool1",
            arguments: "{}",
            type: "function",
            index: 2,
          },
        ];
        const map = convertCallsToMap(calls);

        expect(Object.keys(map)).toEqual(["tool1"]);
        expect(map["tool1"]).toHaveLength(3);
      });
    });
  });
});
