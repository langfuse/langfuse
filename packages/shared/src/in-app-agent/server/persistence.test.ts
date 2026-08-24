import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../db";
import { IN_APP_AGENT_SILENT_MCP_OUTPUT_MESSAGE } from "../constants";
import {
  createSandboxToolCallFileAccumulator,
  getConversationMessages,
  getConversationMessagesForReplay,
  shouldFlushPersistedEvent,
  toPersistableAgentEvent,
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

describe("getConversationMessagesForReplay", () => {
  it("replays signed reasoning and keeps unsigned reasoning display-only", async () => {
    const prisma = {
      inAppAgentEvent: {
        findMany: async () => [
          {
            event: {
              type: EventType.REASONING_MESSAGE_START,
              messageId: "reasoning-unsigned",
              role: "reasoning",
            },
            runId: "run-1",
            createdAt: new Date("2026-08-05T00:00:00.000Z"),
            sequenceNumber: 3,
          },
          {
            event: {
              type: EventType.REASONING_MESSAGE_CONTENT,
              messageId: "reasoning-unsigned",
              delta: "Old turn without a Bedrock signature",
            },
            runId: "run-1",
            createdAt: new Date("2026-08-05T00:00:00.000Z"),
            sequenceNumber: 4,
          },
          {
            event: {
              type: EventType.REASONING_MESSAGE_END,
              messageId: "reasoning-unsigned",
            },
            runId: "run-1",
            createdAt: new Date("2026-08-05T00:00:00.000Z"),
            sequenceNumber: 5,
          },
          {
            event: {
              type: EventType.REASONING_MESSAGE_START,
              messageId: "reasoning-signed",
              role: "reasoning",
            },
            runId: "run-1",
            createdAt: new Date("2026-08-05T00:00:00.000Z"),
            sequenceNumber: 6,
          },
          {
            event: {
              type: EventType.REASONING_MESSAGE_CONTENT,
              messageId: "reasoning-signed",
              delta: "I'm going through the list of prompts.",
            },
            runId: "run-1",
            createdAt: new Date("2026-08-05T00:00:00.000Z"),
            sequenceNumber: 7,
          },
          {
            event: {
              type: EventType.REASONING_MESSAGE_END,
              messageId: "reasoning-signed",
            },
            runId: "run-1",
            createdAt: new Date("2026-08-05T00:00:00.000Z"),
            sequenceNumber: 8,
          },
          {
            event: {
              type: EventType.REASONING_ENCRYPTED_VALUE,
              subtype: "signature",
              entityId: "reasoning-signed",
              encryptedValue: "bedrock-signature",
            },
            runId: "run-1",
            createdAt: new Date("2026-08-05T00:00:00.000Z"),
            sequenceNumber: 9,
          },
          {
            event: {
              type: EventType.TOOL_CALL_START,
              toolCallId: "tool-call-1",
              toolCallName: "langfuse_listPrompts",
              parentMessageId: "assistant-1",
            },
            runId: "run-1",
            createdAt: new Date("2026-08-05T00:00:00.000Z"),
            sequenceNumber: 10,
          },
          {
            event: {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: "tool-call-1",
              delta: '{"page":1}',
            },
            runId: "run-1",
            createdAt: new Date("2026-08-05T00:00:00.000Z"),
            sequenceNumber: 11,
          },
          {
            event: {
              type: EventType.TOOL_CALL_END,
              toolCallId: "tool-call-1",
            },
            runId: "run-1",
            createdAt: new Date("2026-08-05T00:00:00.000Z"),
            sequenceNumber: 12,
          },
          {
            event: {
              type: EventType.TOOL_CALL_RESULT,
              messageId: "tool-result-1",
              toolCallId: "tool-call-1",
              content: "[]",
              role: "tool",
            },
            runId: "run-1",
            createdAt: new Date("2026-08-05T00:00:00.000Z"),
            sequenceNumber: 13,
          },
        ],
      },
    } as unknown as PrismaClient;

    const replayParams = {
      prisma,
      projectId: "project-1",
      conversationId: "conversation-1",
    };

    await expect(getConversationMessages(replayParams)).resolves.toEqual([
      {
        id: "reasoning-unsigned",
        role: "reasoning",
        content: "Old turn without a Bedrock signature",
      },
      {
        id: "reasoning-signed",
        role: "reasoning",
        content: "I'm going through the list of prompts.",
        signature: "bedrock-signature",
      },
      {
        id: "assistant-1",
        role: "assistant",
        runId: "run-1",
        toolCalls: [
          {
            id: "tool-call-1",
            type: "function",
            function: {
              name: "langfuse_listPrompts",
              arguments: '{"page":1}',
            },
          },
        ],
      },
      {
        id: "tool-result-1",
        role: "tool",
        content: "[]",
        toolCallId: "tool-call-1",
      },
    ]);
    await expect(
      getConversationMessagesForReplay(replayParams),
    ).resolves.toEqual([
      {
        id: "reasoning-signed",
        role: "reasoning",
        content: "I'm going through the list of prompts.",
        signature: "bedrock-signature",
      },
      {
        id: "assistant-1",
        role: "assistant",
        toolCalls: [
          {
            id: "tool-call-1",
            type: "function",
            function: {
              name: "langfuse_listPrompts",
              arguments: '{"page":1}',
            },
          },
        ],
      },
      {
        id: "tool-result-1",
        role: "tool",
        content: "[]",
        toolCallId: "tool-call-1",
      },
    ]);
  });
});

describe("toPersistableAgentEvent", () => {
  it("persists Bedrock reasoning signatures and drops encrypted thinking blobs", () => {
    const signatureEvent = {
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: "signature",
      entityId: "reasoning-1",
      encryptedValue: "bedrock-signature",
    };

    expect(toPersistableAgentEvent(signatureEvent)).toEqual(signatureEvent);
    expect(shouldFlushPersistedEvent(signatureEvent)).toBe(true);
    expect(
      toPersistableAgentEvent({
        type: EventType.REASONING_ENCRYPTED_VALUE,
        subtype: "message",
        entityId: "reasoning-1",
        encryptedValue: "encrypted-reasoning",
      }),
    ).toBeNull();
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
