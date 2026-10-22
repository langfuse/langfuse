import {
  createInAppAgentMcpRunOverride,
  verifyInAppAgentMcpRunOverride,
  InAppAgentMcpRunOverrideSchema,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";

describe("in-app agent MCP run override", () => {
  it("creates a signed HMAC token for the override", async () => {
    const token = await createInAppAgentMcpRunOverride({
      toolNames: ["upsertDataset"],
    });

    const parts = token.split(".");
    expect(parts.length).toBe(2);

    const [payloadBase64] = parts;
    const payload = JSON.parse(
      Buffer.from(payloadBase64, "base64url").toString("utf8"),
    );

    expect(payload).toEqual({
      toolName: "upsertDataset",
      toolNames: ["upsertDataset"],
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
    const [payloadBase64, signature] = token.split(".");

    // Tampered signature
    expect(
      verifyInAppAgentMcpRunOverride(`${payloadBase64}.${signature}tampered`),
    ).toBeUndefined();

    // Tampered payload
    const tamperedPayload = Buffer.from(
      JSON.stringify({ toolNames: ["createDashboardWidget"] }),
      "utf8",
    ).toString("base64url");
    expect(
      verifyInAppAgentMcpRunOverride(`${tamperedPayload}.${signature}`),
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
