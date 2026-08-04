import { IN_APP_AGENT_MAX_MCP_TOOL_CALLS_PER_CONVERSATION } from "@langfuse/shared/in-app-agent";
import { prisma } from "@langfuse/shared/src/db";

/**
 * Atomically reserve one Langfuse MCP tool call for an in-app-agent
 * conversation. The conditional update makes parallel tool calls safe: once
 * the budget is exhausted, no caller can reserve another point.
 */
export async function consumeInAppAgentMcpToolCall(params: {
  projectId: string;
  conversationId: string;
}): Promise<boolean> {
  const result = await prisma.inAppAgentConversation.updateMany({
    where: {
      id: params.conversationId,
      projectId: params.projectId,
      deletedAt: null,
      mcpToolCallCount: {
        lt: IN_APP_AGENT_MAX_MCP_TOOL_CALLS_PER_CONVERSATION,
      },
    },
    data: {
      mcpToolCallCount: {
        increment: 1,
      },
    },
  });

  return result.count > 0;
}
