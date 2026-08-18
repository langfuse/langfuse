import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSubmitFeedback, mockFindApiKey } = vi.hoisted(() => ({
  mockSubmitFeedback: vi.fn(),
  mockFindApiKey: vi.fn(),
}));

vi.mock("@/src/features/feedback/server/FeedbackService", () => ({
  submitFeedback: mockSubmitFeedback,
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    apiKey: {
      findFirst: mockFindApiKey,
    },
  },
}));

import { handleSubmitFeedback } from "@/src/features/mcp/features/feedback/tools/submitFeedback";
import { mockServerContext } from "@/src/__tests__/server/mcp-helpers";

const input = {
  targetType: "mcp-tool" as const,
  target: "submitFeedback",
  feedback: "The traces table filter is confusing.",
};

describe("MCP submitFeedback tool", () => {
  beforeEach(() => {
    mockSubmitFeedback.mockReset();
    mockFindApiKey.mockReset();
    mockSubmitFeedback.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("keeps external MCP feedback reporter-agnostic", async () => {
    await handleSubmitFeedback(input, mockServerContext());

    expect(mockFindApiKey).not.toHaveBeenCalled();
    expect(mockSubmitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        input,
        source: "langfuse-mcp",
        reporter: undefined,
      }),
    );
  });

  it("attaches the in-app assistant reporter from the MCP key creator", async () => {
    mockFindApiKey.mockResolvedValueOnce({
      isInAppAgentKey: true,
      createdByUser: {
        id: "user-1",
        email: "ugeon.jeon@creverse.com",
      },
    });

    await handleSubmitFeedback(
      input,
      mockServerContext({
        apiKeyId: "in-app-key-1",
        inAppAgent: { permissions: "read" },
      }),
    );

    expect(mockFindApiKey).toHaveBeenCalledWith({
      where: { id: "in-app-key-1", projectId: "test-project-id" },
      select: {
        isInAppAgentKey: true,
        createdByUser: {
          select: { id: true, email: true },
        },
      },
    });
    expect(mockSubmitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        input,
        source: "in-app-assistant",
        reporter: {
          userId: "user-1",
          email: "ugeon.jeon@creverse.com",
        },
      }),
    );
  });

  it("does not treat a regular API key creator as the reporter", async () => {
    mockFindApiKey.mockResolvedValueOnce({
      isInAppAgentKey: false,
      createdByUser: {
        id: "user-1",
        email: "creator@example.com",
      },
    });

    await handleSubmitFeedback(
      input,
      mockServerContext({
        inAppAgent: { permissions: "read" },
      }),
    );

    expect(mockSubmitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "in-app-assistant",
        reporter: undefined,
      }),
    );
  });
});
