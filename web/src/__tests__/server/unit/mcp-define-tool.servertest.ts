import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "../../../features/mcp/core/define-tool";

describe("defineTool", () => {
  it("accepts object intersections emitted as JSON Schema allOf", () => {
    const schema = z.object({ id: z.string() }).and(
      z.object({
        dataType: z.literal("NUMERIC"),
        value: z.number(),
      }),
    );

    const [tool] = defineTool({
      name: "createScore",
      description: "Create a score",
      baseSchema: schema,
      inputSchema: schema,
      handler: async (input) => input,
    });

    expect(tool.inputSchema).toHaveProperty("allOf");
  });

  // Regression test for MCP TS SDK compatibility: ToolSchema.inputSchema is
  // validated with `z.literal("object")` on the root `type`, so clients drop
  // tools whose root schema omits it. Zod emits intersections as bare `allOf`,
  // so defineTool must inject `type: "object"`.
  it("injects root type: 'object' for intersection schemas (MCP SDK requires it)", () => {
    const schema = z.union([
      z.object({ scoreId: z.string() }),
      z.object({ configId: z.string() }),
    ]);

    const [tool] = defineTool({
      name: "objectUnionTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async (input) => input,
    });

    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema).toHaveProperty("anyOf");
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

  it("rejects unions with non-object branches", () => {
    const schema = z.union([z.string(), z.object({ id: z.string() })]);

    expect(() =>
      defineTool({
        name: "mixedUnionTool",
        description: "",
        baseSchema: schema,
        inputSchema: schema,
        handler: async (input) => input,
      }),
    ).toThrow("Expected object or union schema");
  });
});
