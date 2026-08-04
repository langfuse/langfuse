import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateMany } = vi.hoisted(() => ({ updateMany: vi.fn() }));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    inAppAgentConversation: {
      updateMany,
    },
  },
}));

import { consumeInAppAgentMcpToolCall } from "@/src/features/mcp/server/inAppAgentToolCallLimit";
import { IN_APP_AGENT_MAX_MCP_TOOL_CALLS_PER_CONVERSATION } from "@langfuse/shared/in-app-agent";

describe("consumeInAppAgentMcpToolCall", () => {
  beforeEach(() => {
    updateMany.mockReset();
  });

  it("reserves a call while the conversation budget remains", async () => {
    updateMany.mockResolvedValue({ count: 1 });

    await expect(
      consumeInAppAgentMcpToolCall({
        projectId: "project-1",
        conversationId: "conversation-1",
      }),
    ).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "conversation-1",
        projectId: "project-1",
        deletedAt: null,
        mcpToolCallCount: {
          lt: IN_APP_AGENT_MAX_MCP_TOOL_CALLS_PER_CONVERSATION,
        },
      },
      data: { mcpToolCallCount: { increment: 1 } },
    });
  });

  it("rejects a call once the conversation budget is exhausted", async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      consumeInAppAgentMcpToolCall({
        projectId: "project-1",
        conversationId: "conversation-1",
      }),
    ).resolves.toBe(false);
  });
});
