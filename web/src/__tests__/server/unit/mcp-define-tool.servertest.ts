import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "../../../features/mcp/core/define-tool";

describe("defineTool", () => {
  it("rejects intersection schemas", () => {
    const schema = z.object({ id: z.string() }).and(
      z.object({
        dataType: z.literal("NUMERIC"),
        value: z.number(),
      }),
    );

    expect(() =>
      defineTool({
        name: "createScore",
        description: "Create a score",
        baseSchema: schema,
        inputSchema: schema,
        handler: async (input) => input,
      }),
    ).toThrow("Union and intersection schemas are not supported");
  });

  it("preserves root type: 'object' for plain object schemas", () => {
    const schema = z.object({ name: z.string() });

    const [tool] = defineTool({
      name: "plainTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async (input) => input,
    });

    expect(tool.inputSchema.type).toBe("object");
  });

  it("allows plain object fields named like JSON Schema combinators", () => {
    const schema = z.object({
      anyOf: z.string(),
      oneOf: z.string(),
      allOf: z.string(),
    });

    const [tool] = defineTool({
      name: "combinatorNamedFieldsTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async (input) => input,
    });

    expect(tool.inputSchema.properties).toEqual(
      expect.objectContaining({
        anyOf: expect.objectContaining({ type: "string" }),
        oneOf: expect.objectContaining({ type: "string" }),
        allOf: expect.objectContaining({ type: "string" }),
      }),
    );
  });

  it("rejects union schemas", () => {
    const schema = z.union([z.string(), z.object({ id: z.string() })]);

    expect(() =>
      defineTool({
        name: "mixedUnionTool",
        description: "",
        baseSchema: schema,
        inputSchema: schema,
        handler: async (input) => input,
      }),
    ).toThrow("Union and intersection schemas are not supported");
  });

  it("rejects nested union schemas", () => {
    const schema = z.object({
      filter: z.union([z.string(), z.number()]),
    });

    expect(() =>
      defineTool({
        name: "nestedUnionTool",
        description: "",
        baseSchema: schema,
        inputSchema: schema,
        handler: async (input) => input,
      }),
    ).toThrow("Union and intersection schemas are not supported");
  });

  it("rejects nested intersection schemas", () => {
    const schema = z.object({
      filter: z.object({ id: z.string() }).and(z.object({ name: z.string() })),
    });

    expect(() =>
      defineTool({
        name: "nestedIntersectionTool",
        description: "",
        baseSchema: schema,
        inputSchema: schema,
        handler: async (input) => input,
      }),
    ).toThrow("Union and intersection schemas are not supported");
  });

  it("strips Unicode property escapes from emitted pattern keywords", () => {
    const schema = z.object({
      name: z
        .string()
        .min(1)
        .max(35)
        .regex(/^[\p{L}\p{N}_ .()-]+$/u, "Name contains invalid characters"),
    });

    const [tool] = defineTool({
      name: "scoreConfigTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async (input) => input,
    });

    const nameProperty = (
      tool.inputSchema.properties as Record<string, unknown>
    ).name as Record<string, unknown>;

    expect(nameProperty.pattern).toBeUndefined();
    expect(nameProperty.type).toBe("string");
    expect(nameProperty.minLength).toBe(1);
    expect(nameProperty.maxLength).toBe(35);
  });

  it("preserves ASCII-safe pattern keywords in emitted schemas", () => {
    const schema = z.object({
      slug: z.string().regex(/^[a-z0-9_-]+$/),
    });

    const [tool] = defineTool({
      name: "slugTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async (input) => input,
    });

    const slugProperty = (
      tool.inputSchema.properties as Record<string, unknown>
    ).slug as Record<string, unknown>;

    expect(slugProperty.pattern).toBe("^[a-z0-9_-]+$");
  });
});
