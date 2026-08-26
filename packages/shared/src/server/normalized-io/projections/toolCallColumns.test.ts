import { describe, expect, it } from "vitest";

import type { NormalizedIO } from "../types";
import { toToolColumns } from "./toolCallColumns";

describe("toToolColumns", () => {
  it("projects definitions and executable output calls into ClickHouse columns", () => {
    const io: NormalizedIO = {
      messages: [
        {
          role: "assistant",
          source: "input",
          parts: [
            {
              type: "tool-call",
              toolCallId: "historical-call",
              toolName: "get_weather",
              input: { city: "Paris" },
            },
          ],
        },
        {
          role: "assistant",
          source: "output",
          parts: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "get_weather",
              input: { city: "Berlin" },
              index: 2,
            },
            {
              type: "tool-call",
              toolCallId: "invalid-call",
              toolName: "get_weather",
              input: "not-json",
              invalid: true,
            },
            {
              type: "tool-call",
              toolCallId: "provider-call",
              toolName: "web_search",
              input: { query: "weather Berlin" },
              toolType: "web_search_call",
              providerExecuted: true,
            },
          ],
        },
      ],
      toolDefinitions: [
        {
          name: "get_weather",
          description: "Get the current weather",
          inputSchema: {
            type: "object",
            properties: { city: { type: "string" } },
          },
        },
      ],
      span: { input: null, output: null, metadata: null },
    };

    expect(toToolColumns(io)).toEqual({
      tool_definitions: {
        get_weather: JSON.stringify({
          description: "Get the current weather",
          parameters: JSON.stringify({
            type: "object",
            properties: { city: { type: "string" } },
          }),
        }),
      },
      tool_calls: [
        JSON.stringify({
          id: "call-1",
          arguments: JSON.stringify({ city: "Berlin" }),
          type: "",
          index: 2,
        }),
        JSON.stringify({
          id: "provider-call",
          arguments: JSON.stringify({ query: "weather Berlin" }),
          type: "web_search_call",
          index: 0,
        }),
      ],
      tool_call_names: ["get_weather", "web_search"],
    });
  });
});
