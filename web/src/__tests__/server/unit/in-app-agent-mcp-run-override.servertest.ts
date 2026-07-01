import {
  createInAppAgentMcpRequestMetadata,
  InAppAgentMcpRequestMetadataSchema,
} from "@/src/ee/features/in-app-agent/server/human-in-the-loop";

describe("in-app agent MCP request metadata", () => {
  it("serializes tool override metadata as plain JSON", async () => {
    const token = createInAppAgentMcpRequestMetadata({
      permissions: "single-tool-override",
      actingOnBehalfOfUserId: "user-1",
      allowedToolName: "upsertDataset",
    });

    expect(JSON.parse(token)).toEqual({
      permissions: "single-tool-override",
      actingOnBehalfOfUserId: "user-1",
      allowedToolName: "upsertDataset",
    });
  });

  it("accepts metadata with and without a tool override", async () => {
    const token = createInAppAgentMcpRequestMetadata({
      permissions: "single-tool-override",
      actingOnBehalfOfUserId: "user-1",
      allowedToolName: "upsertDataset",
    });
    const readOnlyToken = createInAppAgentMcpRequestMetadata({
      permissions: "read",
      actingOnBehalfOfUserId: "user-1",
    });

    expect(
      InAppAgentMcpRequestMetadataSchema.safeParse(JSON.parse(token)),
    ).toEqual({
      success: true,
      data: {
        permissions: "single-tool-override",
        actingOnBehalfOfUserId: "user-1",
        allowedToolName: "upsertDataset",
      },
    });
    expect(
      InAppAgentMcpRequestMetadataSchema.safeParse(JSON.parse(readOnlyToken)),
    ).toEqual({
      success: true,
      data: {
        permissions: "read",
        actingOnBehalfOfUserId: "user-1",
      },
    });
  });

  it("rejects malformed or mismatched metadata", () => {
    expect(
      InAppAgentMcpRequestMetadataSchema.safeParse("not-json").success,
    ).toBe(false);

    expect(
      InAppAgentMcpRequestMetadataSchema.safeParse({
        permissions: "single-tool-override",
        actingOnBehalfOfUserId: "user-1",
        allowedToolName: "notAMcpTool",
      }).success,
    ).toBe(false);

    expect(
      InAppAgentMcpRequestMetadataSchema.safeParse({
        other: "value",
      }).success,
    ).toBe(false);
  });
});
