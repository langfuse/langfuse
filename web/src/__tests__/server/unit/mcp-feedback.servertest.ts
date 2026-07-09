const { mockSubmitFeedback } = vi.hoisted(() => ({
  mockSubmitFeedback: vi.fn(),
}));

vi.mock("@/src/features/feedback/server/FeedbackService", () => ({
  submitFeedback: mockSubmitFeedback,
}));

import { describe, expect, it, vi, beforeEach } from "vitest";
import { mockServerContext } from "../mcp-helpers";
import { handleSubmitFeedback } from "@/src/features/mcp/features/feedback/tools/submitFeedback";

describe("MCP submitFeedback tool", () => {
  beforeEach(() => {
    mockSubmitFeedback.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("uses the shared feedback service with MCP auth context", async () => {
    const context = mockServerContext({
      projectId: "project-1",
      orgId: "org-1",
      apiKeyId: "api-key-1",
      publicKey: "pk-test",
    });

    await expect(
      handleSubmitFeedback(
        {
          targetType: "mcp-tool",
          target: "submitFeedback",
          feedback: "The tool is easy to find.",
        },
        context,
      ),
    ).resolves.toEqual({
      id: "11111111-1111-4111-8111-111111111111",
    });

    expect(mockSubmitFeedback).toHaveBeenCalledWith({
      input: {
        targetType: "mcp-tool",
        target: "submitFeedback",
        feedback: "The tool is easy to find.",
      },
      authScope: {
        projectId: "project-1",
        orgId: "org-1",
      },
    });
  });
});
