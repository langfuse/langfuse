import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../db";
import { IN_APP_AGENT_SILENT_MCP_OUTPUT_MESSAGE } from "../constants";
import {
  createSandboxToolCallFileAccumulator,
  getConversationMessages,
} from "./persistence";

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

describe("createSandboxToolCallFileAccumulator", () => {
  it("incrementally builds files from tool-call events", () => {
    const accumulator = createSandboxToolCallFileAccumulator([]);
    const createdAt = new Date("2026-08-05T00:00:00.000Z");

    accumulator.processEvent({
      createdAt,
      runId: "run-1",
      event: {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool-call-1",
        toolCallName: "langfuse_getHealth",
      },
    });
    accumulator.processEvent({
      createdAt,
      runId: "run-1",
      event: {
        type: EventType.TEXT_MESSAGE_CHUNK,
        messageId: "message-1",
        delta: "ignored token",
      },
    });
    accumulator.processEvent({
      createdAt,
      runId: "run-1",
      event: {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool-call-1",
        delta: '{"projectId":"project-1"}',
      },
    });
    accumulator.processEvent({
      createdAt,
      runId: "run-1",
      event: {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: "tool-call-1",
        content: '{"status":"ok"}',
      },
    });

    expect(accumulator.getFiles()).toEqual([
      {
        path: "tool_calls/2026-08-05T00-00-00.000Z_langfuse_getHealth_tool-call-1.json",
        content: JSON.stringify(
          {
            request: { projectId: "project-1" },
            response: { status: "ok" },
            error: null,
          },
          null,
          2,
        ),
      },
    ]);
  });
});
