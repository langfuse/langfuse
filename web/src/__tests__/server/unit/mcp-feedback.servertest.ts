const { mockSubmitFeedback, mockRunMcpTool } = vi.hoisted(() => ({
  mockSubmitFeedback: vi.fn(),
  mockRunMcpTool: vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) => fn()),
}));

vi.mock("@/src/features/feedback/server/FeedbackService", () => ({
  submitFeedback: mockSubmitFeedback,
}));

vi.mock("@/src/features/mcp/core/run-mcp-tool", () => ({
  runMcpTool: mockRunMcpTool,
}));

import { describe, expect, it, vi, beforeEach } from "vitest";
import { ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  LangfuseConflictError,
  ServiceUnavailableError,
} from "@langfuse/shared";
import { mockServerContext } from "../mcp-helpers";
import { handleSubmitFeedback } from "@/src/features/mcp/features/feedback/tools/submitFeedback";

describe("MCP submitFeedback tool", () => {
  beforeEach(() => {
    mockRunMcpTool.mockClear();
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
    expect(mockRunMcpTool.mock.calls[0]?.[0].attributes).toEqual({
      "mcp.feedback_target_type": "mcp-tool",
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

  it("exposes the safe unconfigured-sink conflict", async () => {
    mockSubmitFeedback.mockRejectedValueOnce(
      new LangfuseConflictError(
        "Feedback submission is not configured for this deployment",
      ),
    );

    await expect(
      handleSubmitFeedback(
        {
          targetType: "mcp-tool",
          target: "submitFeedback",
          feedback: "Please enable feedback intake.",
        },
        mockServerContext(),
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidRequest,
      message: expect.stringContaining(
        "Feedback submission is not configured for this deployment",
      ),
    });
  });
});
