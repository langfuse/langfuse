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
  getInAppAgentToolCallOutput,
  partitionPendingRunEvents,
  truncateToolResultsForReplay,
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
    expect(oldestToolResultContent).toContain("readToolOutput");
    expect(oldestToolResultContent.length).toBeLessThan(300);
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

  it("keeps tool results shorter than the placeholder, preserving silent-output pointers", () => {
    const silentPointer = toolMessage(
      "pointer",
      "Output saved to /workspace/tool_calls/langfuse_getHealth_call-pointer.json",
    );
    const midSize = toolMessage("mid", "x".repeat(100));
    const big = bigTool("big");
    const result = compactToolResultsToReplayBudget(
      [silentPointer, midSize, big],
      1,
    );

    expect(result[0]?.content).toContain("/workspace/tool_calls/");
    expect(result[1]?.content).toBe("x".repeat(100));
    expect(result[2]?.content).toContain("omitted from replay");
  });

  it("never grows the replay when only short tool results exist", () => {
    const shorts = Array.from({ length: 5 }, (_, index) =>
      toolMessage(`short-${index}`, "y".repeat(100)),
    );
    const result = compactToolResultsToReplayBudget(shorts, 1);

    const sizeBefore = shorts.reduce(
      (total, m) => total + (m.content?.length ?? 0),
      0,
    );
    const sizeAfter = result.reduce(
      (total, m) => total + (m.content?.length ?? 0),
      0,
    );
    expect(sizeAfter).toBe(sizeBefore);
  });

  it("leaves messages exactly at the budget uncompacted", () => {
    const messages = [bigTool("a"), bigTool("b")]; // suffix: [2000, 1000]

    expect(compactToolResultsToReplayBudget(messages, 2000)).toBe(messages);
  });
});

describe("truncateToolResultsForReplay", () => {
  const toolMessage = (id: string, content: string): AgUiMessage => ({
    id: `message-${id}`,
    role: "tool",
    toolCallId: `call-${id}`,
    content,
  });

  it("returns messages unchanged without a cap or within the cap", () => {
    const messages = [toolMessage("a", "x".repeat(100))];

    expect(truncateToolResultsForReplay(messages, undefined)).toBe(messages);
    expect(truncateToolResultsForReplay(messages, 100)).toBe(messages);
    expect(truncateToolResultsForReplay(messages, 200)).toBe(messages);
  });

  it("reduces oversized results to a head+tail excerpt pointing at readToolOutput", () => {
    const content = `${"h".repeat(700)}${"t".repeat(300)}`;
    const result = truncateToolResultsForReplay([toolMessage("big", content)], 200);

    const truncatedMessage = result[0];
    expect(truncatedMessage?.role).toBe("tool");
    if (truncatedMessage?.role !== "tool") {
      throw new Error("expected a tool message");
    }
    const truncated = truncatedMessage.content;
    expect(truncated.length).toBeLessThan(content.length);
    expect(truncated.startsWith("h".repeat(140))).toBe(true);
    expect(truncated.endsWith("t".repeat(60))).toBe(true);
    expect(truncated).toContain("call-big");
    expect(truncated).toContain("readToolOutput");
    expect(truncated).toContain("truncated");
  });

  it("never modifies non-tool messages or silent-output pointers", () => {
    const userMessage: AgUiMessage = {
      id: "u",
      role: "user",
      content: "y".repeat(10_000),
    };
    const pointer = toolMessage(
      "pointer",
      "Output saved to /workspace/tool_calls/langfuse_getHealth_call-pointer.json",
    );

    const result = truncateToolResultsForReplay([userMessage, pointer], 100);

    expect(result[0]).toBe(userMessage);
    expect(result[1]).toBe(pointer);
  });
});

describe("getInAppAgentToolCallOutput", () => {
  it("returns a page of the latest persisted result for the toolCallId", async () => {
    const prisma = {
      inAppAgentEvent: {
        findFirst: async ({
          where,
        }: {
          where: { event?: { equals?: string } };
        }) =>
          where.event?.equals === "call-1"
            ? { event: { toolCallId: "call-1", content: "a".repeat(100) } }
            : null,
      },
    } as unknown as PrismaClient;

    await expect(
      getInAppAgentToolCallOutput({
        prisma,
        projectId: "p",
        conversationId: "c",
        toolCallId: "call-1",
        offset: 90,
        limit: 20,
      }),
    ).resolves.toEqual({
      toolCallId: "call-1",
      totalChars: 100,
      offset: 90,
      returnedChars: 10,
      hasMore: false,
      content: "a".repeat(10),
    });

    await expect(
      getInAppAgentToolCallOutput({
        prisma,
        projectId: "p",
        conversationId: "c",
        toolCallId: "missing",
      }),
    ).resolves.toBeNull();
  });
});
