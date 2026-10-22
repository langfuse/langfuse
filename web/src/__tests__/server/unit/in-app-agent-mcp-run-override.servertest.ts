import {
  createInAppAgentMcpRunOverride,
  verifyInAppAgentMcpRunOverride,
  InAppAgentMcpRunOverrideSchema,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";

describe("in-app agent MCP run override", () => {
  it("creates a signed JSON envelope compatible with older web pods during rolling deploys", async () => {
    const token = await createInAppAgentMcpRunOverride({
      toolNames: ["upsertDataset"],
    });

    const parsedJson = JSON.parse(token);
    expect(parsedJson).toEqual({
      toolName: "upsertDataset",
      toolNames: ["upsertDataset"],
      signature: expect.any(String),
    });

    // Older web pods reading InAppAgentMcpRunOverrideSchema still parse it
    expect(InAppAgentMcpRunOverrideSchema.safeParse(parsedJson)).toEqual({
      success: true,
      data: {
        toolNames: ["upsertDataset"],
      },
    });
  });

  it("verifies a valid signed override", async () => {
    const token = await createInAppAgentMcpRunOverride({
      toolNames: ["upsertDataset"],
    });

    expect(verifyInAppAgentMcpRunOverride(token)).toEqual({
      toolNames: ["upsertDataset"],
    });
  });

  it("rejects unsigned plain JSON overrides", () => {
    expect(
      verifyInAppAgentMcpRunOverride('{"toolName":"upsertDataset"}'),
    ).toBeUndefined();
    expect(
      verifyInAppAgentMcpRunOverride('{"toolNames":["upsertDataset"]}'),
    ).toBeUndefined();
  });

  it("rejects tampered tokens", async () => {
    const token = await createInAppAgentMcpRunOverride({
      toolNames: ["upsertDataset"],
    });
    const parsed = JSON.parse(token);

    // Tampered signature
    expect(
      verifyInAppAgentMcpRunOverride(
        JSON.stringify({ ...parsed, signature: `${parsed.signature}tampered` }),
      ),
    ).toBeUndefined();

    // Tampered toolNames
    expect(
      verifyInAppAgentMcpRunOverride(
        JSON.stringify({ ...parsed, toolNames: ["createDashboardWidget"] }),
      ),
    ).toBeUndefined();
  });

  it("rejects tokens signed with a different secret", async () => {
    const token = await createInAppAgentMcpRunOverride({
      toolNames: ["upsertDataset"],
      secret: "secret-a",
    });

    expect(verifyInAppAgentMcpRunOverride(token, "secret-b")).toBeUndefined();
    expect(verifyInAppAgentMcpRunOverride(token, "secret-a")).toEqual({
      toolNames: ["upsertDataset"],
    });
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
