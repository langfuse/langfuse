import { describe, expect, it } from "vitest";

import {
  type ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  LLMAdapter,
} from "../types";
import { mapChatMessagesToModelMessages } from "./messages";

const systemMessage: ChatMessage = {
  type: ChatMessageType.System,
  role: ChatMessageRole.System,
  content: "You are terse.",
};

const userMessage: ChatMessage = {
  type: ChatMessageType.User,
  role: ChatMessageRole.User,
  content: "Hi",
};

describe("mapChatMessagesToModelMessages", () => {
  it("keeps the first system message as system", () => {
    expect(
      mapChatMessagesToModelMessages([systemMessage, userMessage], {
        adapter: LLMAdapter.Anthropic,
      }),
    ).toEqual([
      { role: "system", content: "You are terse." },
      { role: "user", content: "Hi" },
    ]);
  });

  it("converts a lone message to a user message for providers requiring one", () => {
    for (const adapter of [
      LLMAdapter.Anthropic,
      LLMAdapter.Bedrock,
      LLMAdapter.VertexAI,
      LLMAdapter.GoogleAIStudio,
    ]) {
      expect(
        mapChatMessagesToModelMessages([systemMessage], { adapter }),
      ).toEqual([{ role: "user", content: "You are terse." }]);
    }
  });

  it("keeps a lone system message as system for OpenAI-style providers", () => {
    for (const adapter of [LLMAdapter.OpenAI, LLMAdapter.Azure]) {
      expect(
        mapChatMessagesToModelMessages([systemMessage], { adapter }),
      ).toEqual([{ role: "system", content: "You are terse." }]);
    }
  });

  it("keeps a lone empty message", () => {
    expect(
      mapChatMessagesToModelMessages([{ ...systemMessage, content: "" }], {
        adapter: LLMAdapter.Anthropic,
      }),
    ).toEqual([{ role: "user", content: "" }]);
  });

  it("keeps blank messages so a replayed conversation keeps its shape", () => {
    expect(
      mapChatMessagesToModelMessages([
        systemMessage,
        { ...userMessage, content: "" },
        { ...userMessage, content: "   " },
        {
          type: ChatMessageType.AssistantText,
          role: ChatMessageRole.Assistant,
          content: "",
        },
        userMessage,
      ]),
    ).toEqual([
      { role: "system", content: "You are terse." },
      { role: "user", content: "" },
      { role: "user", content: "   " },
      { role: "assistant", content: "" },
      { role: "user", content: "Hi" },
    ]);
  });

  it("keeps a tool result with empty output", () => {
    expect(
      mapChatMessagesToModelMessages([
        {
          type: ChatMessageType.AssistantToolCall,
          role: ChatMessageRole.Assistant,
          content: "",
          toolCalls: [{ id: "call_1", name: "search", args: {} }],
        },
        {
          type: ChatMessageType.ToolResult,
          role: ChatMessageRole.Tool,
          content: "",
          toolCallId: "call_1",
        },
      ]),
    ).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "search",
            input: {},
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "search",
            output: { type: "text", value: "" },
          },
        ],
      },
    ]);
  });
});
