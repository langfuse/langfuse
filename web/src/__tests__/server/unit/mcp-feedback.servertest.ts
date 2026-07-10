const { mockSubmitFeedback } = vi.hoisted(() => ({
  mockSubmitFeedback: vi.fn(),
}));

vi.mock("@/src/features/feedback/server/FeedbackService", () => ({
  submitFeedback: mockSubmitFeedback,
}));

import { describe, expect, it, vi, beforeEach } from "vitest";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ServiceUnavailableError } from "@langfuse/shared";
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
      context: {
        projectId: "project-1",
        orgId: "org-1",
      },
      source: "langfuse-mcp",
    });

    mockSubmitFeedback.mockRejectedValueOnce(
      new ServiceUnavailableError("Feedback Slack sink rejected message"),
    );

    try {
      await handleSubmitFeedback(
        {
          targetType: "mcp-tool",
          target: "submitFeedback",
          feedback: "The Slack sink failed.",
        },
        context,
      );
      throw new Error("Expected submitFeedback to throw");
    } catch (error) {
      expect(error).toMatchObject({ code: ErrorCode.InternalError });
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "An internal server error occurred. Please try again later.",
      );
    }
  });
});
