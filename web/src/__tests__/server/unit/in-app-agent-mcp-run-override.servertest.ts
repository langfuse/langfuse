import {
  createInAppAgentMcpRunOverride,
  InAppAgentMcpRunOverrideSchema,
} from "@/src/ee/features/in-app-agent/server/human-in-the-loop";

describe("in-app agent MCP run override", () => {
  it("serializes a single-tool override in the legacy shape", async () => {
    const token = await createInAppAgentMcpRunOverride({
      toolNames: ["upsertDataset"],
    });

    expect(JSON.parse(token)).toEqual({
      toolName: "upsertDataset",
    });
  });

  it("serializes a multi-tool override as a tool name list", async () => {
    const token = await createInAppAgentMcpRunOverride({
      toolNames: ["upsertDataset", "createDashboardWidget"],
    });

    expect(JSON.parse(token)).toEqual({
      toolNames: ["upsertDataset", "createDashboardWidget"],
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
          toolName: "upsertDataset",
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
