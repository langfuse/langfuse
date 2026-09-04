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

  it("drops a lone empty message", () => {
    expect(
      mapChatMessagesToModelMessages([{ ...systemMessage, content: "" }], {
        adapter: LLMAdapter.Anthropic,
      }),
    ).toEqual([]);
  });
});
