import { describe, expect, it } from "vitest";

import {
  hasPromptToolStructuredOutputConflict,
  parsePromptToolConfig,
} from "./promptToolConfig";

const weatherTool = {
  name: "get_weather",
  description: "Get the weather for a location",
  parameters: {
    type: "object",
    properties: { location: { type: "string" } },
    required: ["location"],
  },
};

describe("parsePromptToolConfig", () => {
  describe("configs without tools", () => {
    it.each([
      ["null config", null],
      ["undefined config", undefined],
      ["string config", "some config"],
      ["array config", [weatherTool]],
      ["empty object", {}],
      ["object without tools key", { model: "gpt-4.1" }],
      ["empty tools array", { tools: [] }],
    ])("returns none for %s", (_label, config) => {
      expect(parsePromptToolConfig(config)).toEqual({ status: "none" });
    });
  });

  describe("valid tool configs", () => {
    it("parses the flat Langfuse shape", () => {
      expect(parsePromptToolConfig({ tools: [weatherTool] })).toEqual({
        status: "valid",
        tools: [weatherTool],
      });
    });

    it("unwraps the OpenAI function shape", () => {
      expect(
        parsePromptToolConfig({
          tools: [{ type: "function", function: weatherTool }],
        }),
      ).toEqual({ status: "valid", tools: [weatherTool] });
    });

    it("parses mixed flat and OpenAI-wrapped tools", () => {
      const timeTool = {
        name: "get_time",
        description: "Get the current time",
        parameters: { type: "object", properties: {} },
      };

      expect(
        parsePromptToolConfig({
          tools: [weatherTool, { type: "function", function: timeTool }],
        }),
      ).toEqual({ status: "valid", tools: [weatherTool, timeTool] });
    });
  });

  describe("invalid tool configs", () => {
    it.each([
      ["tools is not an array", { tools: "get_weather" }],
      ["tools is an object", { tools: { get_weather: weatherTool } }],
      ["entry missing parameters", { tools: [{ name: "broken" }] }],
      ["entry missing name", { tools: [{ parameters: { type: "object" } }] }],
      [
        "entry missing description",
        {
          tools: [{ name: "get_weather", parameters: { type: "object" } }],
        },
      ],
      ["entry is a string", { tools: ["get_weather"] }],
      ["entry has an empty name", { tools: [{ ...weatherTool, name: "" }] }],
      [
        "entry has a provider-incompatible name",
        { tools: [{ ...weatherTool, name: "get weather" }] },
      ],
      [
        "one invalid entry invalidates all tools",
        { tools: [weatherTool, { name: "broken" }] },
      ],
      [
        "duplicate tool names",
        { tools: [weatherTool, { ...weatherTool, description: "duplicate" }] },
      ],
    ])("returns invalid for %s", (_label, config) => {
      expect(parsePromptToolConfig(config)).toEqual({ status: "invalid" });
    });
  });
});

describe("hasPromptToolStructuredOutputConflict", () => {
  const validConfig = parsePromptToolConfig({ tools: [weatherTool] });

  it("detects valid tools combined with structured output", () => {
    expect(hasPromptToolStructuredOutputConflict(validConfig, true)).toBe(true);
  });

  it("allows tools or structured output independently", () => {
    expect(hasPromptToolStructuredOutputConflict(validConfig, false)).toBe(
      false,
    );
    expect(
      hasPromptToolStructuredOutputConflict({ status: "invalid" }, true),
    ).toBe(false);
  });
});
