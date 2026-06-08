import { describe, expect, it } from "vitest";

import { buildPlaygroundConfig, parsePlaygroundConfig } from "./promptConfig";
import { type PlaygroundSchema, type PlaygroundTool } from "./types";

const tool: PlaygroundTool = {
  id: "client-only-id",
  name: "get_weather",
  description: "Get the weather for a location",
  parameters: {
    type: "object",
    properties: { location: { type: "string" } },
    required: ["location"],
  },
};

const schema: PlaygroundSchema = {
  id: "client-only-id",
  name: "weather",
  description: "Structured weather output",
  schema: { type: "object", properties: { temp: { type: "number" } } },
};

describe("buildPlaygroundConfig", () => {
  it("drops client-only fields and keeps tool/schema definitions", () => {
    expect(
      buildPlaygroundConfig({ tools: [tool], structuredOutputSchema: schema }),
    ).toEqual({
      tools: [
        {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      ],
      structuredOutputSchema: {
        name: schema.name,
        description: schema.description,
        schema: schema.schema,
      },
    });
  });

  it("omits empty tools and absent schema", () => {
    expect(buildPlaygroundConfig({ tools: [] })).toEqual({});
    expect(buildPlaygroundConfig({ structuredOutputSchema: null })).toEqual({});
  });
});

describe("parsePlaygroundConfig", () => {
  it("round-trips tools and schema written by buildPlaygroundConfig", () => {
    const config = buildPlaygroundConfig({
      tools: [tool],
      structuredOutputSchema: schema,
    });

    const parsed = parsePlaygroundConfig(config);

    expect(parsed.tools).toHaveLength(1);
    expect(parsed.tools[0]).toMatchObject({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    });
    expect(parsed.tools[0].id).toBeTruthy();
    expect(parsed.structuredOutputSchema).toMatchObject({
      name: schema.name,
      description: schema.description,
      schema: schema.schema,
    });
    expect(parsed.structuredOutputSchema?.id).toBeTruthy();
  });

  it("returns empty defaults for configs without playground state", () => {
    expect(parsePlaygroundConfig({ temperature: 0.7 })).toEqual({
      tools: [],
      structuredOutputSchema: null,
    });
    expect(parsePlaygroundConfig(undefined)).toEqual({
      tools: [],
      structuredOutputSchema: null,
    });
  });

  it("ignores malformed tool definitions", () => {
    expect(
      parsePlaygroundConfig({ tools: [{ name: "missing_fields" }] }),
    ).toEqual({ tools: [], structuredOutputSchema: null });
  });
});
