import {
  createInAppAgentMcpRunOverride,
  InAppAgentMcpRunOverrideSchema,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";

describe("in-app agent MCP run override", () => {
  it("serializes the override as plain JSON", async () => {
    const token = await createInAppAgentMcpRunOverride({
      toolNames: ["upsertDataset"],
    });

    expect(JSON.parse(token)).toEqual({
      toolName: "upsertDataset",
      toolNames: ["upsertDataset"],
    });
  });

  it("accepts a matching plain JSON override", async () => {
    const token = await createInAppAgentMcpRunOverride({
      toolNames: ["upsertDataset"],
    });

    expect(InAppAgentMcpRunOverrideSchema.safeParse(JSON.parse(token))).toEqual(
      {
        success: true,
        data: {
          toolNames: ["upsertDataset"],
        },
      },
    );
  });

  it("rejects malformed or mismatched overrides", () => {
    expect(InAppAgentMcpRunOverrideSchema.safeParse("not-json").success).toBe(
      false,
    );

    expect(
      InAppAgentMcpRunOverrideSchema.safeParse({
        toolName: "notAMcpTool",
      }).success,
    ).toBe(false);

    expect(
      InAppAgentMcpRunOverrideSchema.safeParse({
        other: "value",
      }).success,
    ).toBe(false);
  });
});
