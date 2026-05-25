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

  it("defines updateScoreConfig without omitting from a refined schema", () => {
    expect(updateScoreConfigTool.name).toBe("updateScoreConfig");
  });
});
