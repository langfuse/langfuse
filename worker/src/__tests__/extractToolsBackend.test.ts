import { describe, it, expect } from "vitest";
import {
  extractToolsFromObservation,
  ClickhouseToolDefinitionSchema,
  ClickhouseToolArgumentSchema,
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
});
