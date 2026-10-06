import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../db";
import { IN_APP_AGENT_REDIRECT_TOOL_NAME } from "../constants";
import { buildInAppAgentToolApprovalEvent } from "../approvalEvents";
import type { AgUiMessage } from "../schema";
import {
  compactToolResultsToReplayBudget,
  createSandboxToolCallFileAccumulator,
  getConversationMessages,
  partitionPendingRunEvents,
} from "./persistence";

describe("getConversationMessages", () => {
  it("redacts silent MCP tool outputs", async () => {
    const content = JSON.stringify({
      type: "silent-mcp-output",
      output: { data: [{ id: "observation-1" }] },
      toolCallId: "tool-call-1",
      toolName: "langfuse_getHealth",
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
        content:
          "Output saved to /workspace/tool_calls/langfuse_getHealth_tool-call-1.json",
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
        path: "tool_calls/langfuse_getHealth_tool-call-1.json",
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

describe("partitionPendingRunEvents", () => {
  it("retains a redirect approval sidecar until the redirect result arrives", () => {
    const sidecar = buildInAppAgentToolApprovalEvent({
      toolCallId: "redirect-1",
      toolName: IN_APP_AGENT_REDIRECT_TOOL_NAME,
      source: "auto",
    });
    const start = {
      type: EventType.TOOL_CALL_START,
      toolCallId: "redirect-1",
      toolCallName: IN_APP_AGENT_REDIRECT_TOOL_NAME,
    };
    const args = {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: "redirect-1",
      delta: "{}",
    };
    const end = {
      type: EventType.TOOL_CALL_END,
      toolCallId: "redirect-1",
    };

    expect(partitionPendingRunEvents([start, sidecar, args, end])).toEqual({
      eventsToAppend: [],
      retainedEvents: [start, sidecar, args, end],
    });
  });
});

describe("compactToolResultsToReplayBudget", () => {
  const toolMessage = (id: string, content: string): AgUiMessage => ({
    id: `message-${id}`,
    role: "tool",
    toolCallId: `call-${id}`,
    content,
  });
  const userMessage = (id: string, content: string): AgUiMessage => ({
    id: `message-${id}`,
    role: "user",
    content,
  });

  // chars/4 token estimate: 4000 chars -> 1000 tokens
  const bigTool = (id: string) => toolMessage(id, "x".repeat(4000));

  it("returns messages unchanged without a budget", () => {
    const messages = [bigTool("old"), userMessage("u", "hello")];

    expect(compactToolResultsToReplayBudget(messages, undefined)).toBe(messages);
  });

  it("returns messages unchanged when within budget", () => {
    const messages = [bigTool("old"), userMessage("u", "hello")];

    expect(compactToolResultsToReplayBudget(messages, 2000)).toBe(messages);
  });

  it("compacts only tool results outside the budget, newest kept intact", () => {
    const messages = [
      bigTool("oldest"),
      userMessage("middle", "hi"), // 1 token
      bigTool("newest"),
    ]; // suffix tokens: [2001, 1001, 1000]

    const result = compactToolResultsToReplayBudget(messages, 1500);

    expect(result).toHaveLength(3);
    const oldestToolResultContent = result[0]?.content ?? "";
    expect(result[0]).toMatchObject({
      id: "message-oldest",
      role: "tool",
      toolCallId: "call-oldest",
    });
    expect(oldestToolResultContent).toContain("call-oldest");
    expect(oldestToolResultContent).toContain("omitted from replay");
    expect(oldestToolResultContent.length).toBeLessThan(200);
    expect(result[1]).toBe(messages[1]);
    expect(result[2]).toBe(messages[2]);
  });

  it("never modifies non-tool messages even outside the budget", () => {
    const longUser = userMessage("u", "y".repeat(4000));
    const messages = [longUser, bigTool("new")]; // suffix: [1001, 1000]

    const result = compactToolResultsToReplayBudget(messages, 500);

    expect(result[0]).toBe(longUser);
    expect(result[1]?.content).toContain("omitted from replay");
  });

  it("keeps tool results a placeholder would not shrink", () => {
    const tiny = toolMessage("tiny", "ok"); // 1 token, shorter than any placeholder
    const big = bigTool("big");
    const result = compactToolResultsToReplayBudget([tiny, big], 1);

    expect(result[0]?.content).toBe("ok");
    expect(result[1]?.content).toContain("omitted from replay");
  });

  it("leaves messages exactly at the budget uncompacted", () => {
    const messages = [bigTool("a"), bigTool("b")]; // suffix: [2000, 1000]

    expect(compactToolResultsToReplayBudget(messages, 2000)).toBe(messages);
  });
});
