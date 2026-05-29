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
});
