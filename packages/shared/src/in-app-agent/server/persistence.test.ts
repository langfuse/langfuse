import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../db";
import { IN_APP_AGENT_SILENT_MCP_OUTPUT_MESSAGE } from "../constants";
import { getConversationMessages } from "./persistence";

describe("getConversationMessages", () => {
  it("redacts silent MCP tool outputs", async () => {
    const content = JSON.stringify({
      type: "silent-mcp-output",
      output: { data: [{ id: "observation-1" }] },
    });
    const prisma = {
      inAppAgentEvent: {
        findMany: async () => [
          {
            event: {
              type: EventType.TOOL_CALL_RESULT,
              messageId: "tool-result-1",
              toolCallId: "tool-call-1",
              content,
            },
            runId: "run-1",
            createdAt: new Date("2026-08-05T00:00:00.000Z"),
            sequenceNumber: 0,
          },
        ],
      },
    } as unknown as PrismaClient;

    await expect(
      getConversationMessages({
        prisma,
        projectId: "project-1",
        conversationId: "conversation-1",
      }),
    ).resolves.toEqual([
      {
        id: "tool-result-1",
        role: "tool",
        toolCallId: "tool-call-1",
        content: IN_APP_AGENT_SILENT_MCP_OUTPUT_MESSAGE,
      },
    ]);
  });
});
