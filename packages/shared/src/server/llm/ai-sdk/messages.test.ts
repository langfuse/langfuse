import { describe, expect, it } from "vitest";

import { isLLMCompletionError } from "../errors";
import { ChatMessage, ChatMessageRole, ChatMessageType } from "../types";
import { mapChatMessagesToModelMessages } from "./messages";

const systemMessage: ChatMessage = {
  type: ChatMessageType.System,
  role: ChatMessageRole.System,
  content: "You are helpful.",
};

const userMessage: ChatMessage = {
  type: ChatMessageType.User,
  role: ChatMessageRole.User,
  content: "Hi",
};

describe("mapChatMessagesToModelMessages", () => {
  it("maps the first system message to system and later ones to user", () => {
    const result = mapChatMessagesToModelMessages([
      systemMessage,
      userMessage,
      { ...systemMessage, content: "Second system" },
    ]);

    expect(result).toEqual([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
      { role: "user", content: "Second system" },
    ]);
  });

  it("safely stringifies non-string content", () => {
    const result = mapChatMessagesToModelMessages([
      {
        role: ChatMessageRole.User,
        content: { foo: "bar" },
      } as unknown as ChatMessage,
    ]);

    expect(result).toEqual([{ role: "user", content: '{"foo":"bar"}' }]);
  });

  it("drops empty messages", () => {
    const result = mapChatMessagesToModelMessages([
      { ...userMessage, content: "" },
      userMessage,
    ]);

    expect(result).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("maps assistant tool calls and tool results with resolved tool names", () => {
    const result = mapChatMessagesToModelMessages([
      userMessage,
      {
        type: ChatMessageType.AssistantToolCall,
        role: ChatMessageRole.Assistant,
        content: "",
        toolCalls: [
          { id: "call_1", name: "get_weather", args: { city: "Berlin" } },
        ],
      },
      {
        type: ChatMessageType.ToolResult,
        role: ChatMessageRole.Tool,
        content: "sunny",
        toolCallId: "call_1",
      },
    ]);

    expect(result).toEqual([
      { role: "user", content: "Hi" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "get_weather",
            input: { city: "Berlin" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "get_weather",
            output: { type: "text", value: "sunny" },
          },
        ],
      },
    ]);
  });

  it("fails fast on orphan tool results as non-retryable", () => {
    try {
      mapChatMessagesToModelMessages([
        {
          type: ChatMessageType.ToolResult,
          role: ChatMessageRole.Tool,
          content: "sunny",
          toolCallId: "call_unknown",
        },
      ]);
      expect.unreachable("expected an error");
    } catch (e) {
      expect(isLLMCompletionError(e)).toBe(true);
      expect((e as { isRetryable: boolean }).isRetryable).toBe(false);
      expect((e as { responseStatusCode: number }).responseStatusCode).toBe(
        400,
      );
    }
  });
});
