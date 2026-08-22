import { describe, expect, it } from "vitest";

import {
  buildPlaygroundConfig,
  mergePlaygroundConfig,
  parsePlaygroundConfig,
} from "./promptConfig";
import {
  type PlaygroundSchema,
  type PlaygroundTool,
} from "@/src/features/playground/page/types";

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
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          description: schema.description,
          schema: schema.schema,
          strict: true,
        },
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

  it("loads a name-only tool, since prompt configs may omit the rest", () => {
    // `parsePromptToolConfig` fills in an empty description and parameters.
    expect(
      parsePlaygroundConfig({ tools: [{ name: "name_only" }] }).tools.map(
        (t) => t.name,
      ),
    ).toEqual(["name_only"]);
  });

  it("loads no tools at all when the tool set is unusable", () => {
    // A nameless entry makes the whole set invalid: loading a silently reduced
    // tool set would be worse than loading none.
    expect(
      parsePlaygroundConfig({ tools: [tool, { description: "x" }] }),
    ).toEqual({ tools: [], structuredOutputSchema: null });
  });

  it("reads OpenAI-wrapped tools, the shape the prompt config docs use", () => {
    const parsed = parsePlaygroundConfig({
      tools: [
        {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        },
      ],
    });

    expect(parsed.tools.map((t) => t.name)).toEqual([tool.name]);
  });

  it("does not discard tools when the schema is malformed, and vice versa", () => {
    // A malformed schema must not discard valid tools...
    expect(
      parsePlaygroundConfig({
        tools: [tool],
        structuredOutputSchema: { name: 1 },
      }).tools.map((t) => t.name),
    ).toEqual([tool.name]);

    // ...and an unusable tool set must not discard a valid schema.
    const parsed = parsePlaygroundConfig({
      tools: [tool, { name: "missing_fields" }],
      structuredOutputSchema: schema,
    });
    expect(parsed.structuredOutputSchema?.name).toBe(schema.name);
  });

  it("reads a hand-written response_format when structuredOutputSchema is absent", () => {
    // Shape documented for prompt configs; `description` is not part of it.
    const parsed = parsePlaygroundConfig({
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          schema: schema.schema,
          strict: true,
        },
      },
    });

    expect(parsed.structuredOutputSchema).toMatchObject({
      name: schema.name,
      description: "",
      schema: schema.schema,
    });

    // Re-saving such a prompt emits both keys, so either reader keeps working.
    const rebuilt = buildPlaygroundConfig(parsed);
    expect(rebuilt.structuredOutputSchema).toEqual({
      name: schema.name,
      description: "",
      schema: schema.schema,
    });
    expect(rebuilt.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: schema.name,
        description: "",
        schema: schema.schema,
        strict: true,
      },
    });
  });

  it("falls back to response_format when structuredOutputSchema is malformed", () => {
    const parsed = parsePlaygroundConfig({
      structuredOutputSchema: { name: 1 },
      response_format: {
        type: "json_schema",
        json_schema: { name: schema.name, schema: schema.schema },
      },
    });

    expect(parsed.structuredOutputSchema?.name).toBe(schema.name);
  });
});

describe("mergePlaygroundConfig", () => {
  it("drops previously persisted keys when the user cleared tools and schema", () => {
    const existingConfig = buildPlaygroundConfig({
      tools: [tool],
      structuredOutputSchema: schema,
    });

    const merged = mergePlaygroundConfig(existingConfig, {
      tools: [],
      structuredOutputSchema: null,
    });

    // Clearing in the playground must not leave the old definitions behind,
    // under either of the two keys we write.
    expect(merged).toEqual({});
    expect(parsePlaygroundConfig(merged)).toEqual({
      tools: [],
      structuredOutputSchema: null,
    });
  });

  it("preserves config keys the playground does not own", () => {
    const merged = mergePlaygroundConfig(
      {
        model: "gpt-4o",
        temperature: 0.7,
        structuredOutputSchema: { name: "stale", description: "", schema: {} },
      },
      { tools: [tool], structuredOutputSchema: schema },
    );

    expect(merged.model).toBe("gpt-4o");
    expect(merged.temperature).toBe(0.7);
    expect(parsePlaygroundConfig(merged).structuredOutputSchema?.name).toBe(
      schema.name,
    );
  });

  it("tolerates a config that is not a JSON object", () => {
    expect(mergePlaygroundConfig(null, { tools: [tool] })).toEqual(
      buildPlaygroundConfig({ tools: [tool] }),
    );
    expect(mergePlaygroundConfig("not json", {})).toEqual({});
  });
});
