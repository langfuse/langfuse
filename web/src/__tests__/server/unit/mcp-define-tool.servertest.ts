import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "../../../features/mcp/core/define-tool";
import { updateScoreConfigTool } from "../../../features/mcp/features/scores/tools/updateScoreConfig";

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
    const schema = z.object({ id: z.string() }).and(
      z.object({ value: z.number() }),
    );

    const [tool] = defineTool({
      name: "intersectionTool",
      description: "",
      baseSchema: schema,
      inputSchema: schema,
      handler: async (input) => input,
    });

    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema).toHaveProperty("allOf");
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

  it("defines updateScoreConfig with MCP-compliant root inputSchema", () => {
    expect(updateScoreConfigTool.name).toBe("updateScoreConfig");
    // Real-world tool from PR #13781 that originally broke MCP clients.
    expect(updateScoreConfigTool.inputSchema.type).toBe("object");
  });
});
