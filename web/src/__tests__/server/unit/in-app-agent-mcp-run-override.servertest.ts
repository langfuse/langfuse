import {
  createInAppAgentMcpRunOverride,
  hasValidInAppAgentMcpRunOverride,
} from "@/src/ee/features/in-app-agent/server/human-in-the-loop";

describe("in-app agent MCP run override", () => {
  it("serializes the override as plain JSON", async () => {
    const token = await createInAppAgentMcpRunOverride({
      apiKeyId: "api-key-id",
      projectId: "project-id",
      runId: "run-id",
    });

    expect(JSON.parse(token)).toEqual({
      apiKeyId: "api-key-id",
      projectId: "project-id",
      runId: "run-id",
    });
  });

  it("accepts a matching plain JSON override for in-app agent keys", async () => {
    const token = await createInAppAgentMcpRunOverride({
      apiKeyId: "api-key-id",
      projectId: "project-id",
      runId: "run-id",
    });

    await expect(
      hasValidInAppAgentMcpRunOverride({
        apiKeyId: "api-key-id",
        projectId: "project-id",
        isInAppAgentKey: true,
        headerValue: token,
      }),
    ).resolves.toBe(true);
  });

  it("rejects malformed or mismatched overrides", async () => {
    await expect(
      hasValidInAppAgentMcpRunOverride({
        apiKeyId: "api-key-id",
        projectId: "project-id",
        isInAppAgentKey: true,
        headerValue: "not-json",
      }),
    ).resolves.toBe(false);

    await expect(
      hasValidInAppAgentMcpRunOverride({
        apiKeyId: "api-key-id",
        projectId: "project-id",
        isInAppAgentKey: true,
        headerValue: JSON.stringify({
          apiKeyId: "other-api-key-id",
          projectId: "project-id",
          runId: "run-id",
        }),
      }),
    ).resolves.toBe(false);

    await expect(
      hasValidInAppAgentMcpRunOverride({
        apiKeyId: "api-key-id",
        projectId: "project-id",
        isInAppAgentKey: true,
        headerValue: JSON.stringify({
          apiKeyId: "api-key-id",
          projectId: "project-id",
        }),
      }),
    ).resolves.toBe(false);
  });
});
