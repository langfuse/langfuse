// @vitest-environment node

import {
  type ChatMlMessage,
  getMessageTitle,
  hasRenderableContent,
  hasAdditionalData,
  hasPassthroughJson,
  isPlaceholderMessage,
  isOnlyJsonMessage,
  hasRenderableConversationMessages,
  shouldRenderMessage,
  shouldRenderMessageForContentMode,
  parseToolCallsFromMessage,
  isExplicitChatMessage,
  isChatConversation,
} from "./chatMessageUtils";

// Helper to create test messages - only includes fields that are explicitly passed
// This is important because hasAdditionalData checks Object.keys()
const createMessage = (fields: Partial<ChatMlMessage>): ChatMlMessage =>
  fields as ChatMlMessage;

describe("chat-message-utils", () => {
  describe("getMessageTitle", () => {
    it("returns name when present", () => {
      expect(
        getMessageTitle(createMessage({ role: "user", name: "John" })),
      ).toBe("John");
    });

    it("returns role when name is not present", () => {
      expect(getMessageTitle(createMessage({ role: "assistant" }))).toBe(
        "assistant",
      );
    });

    it("returns empty string when neither name nor role present", () => {
      expect(
        getMessageTitle(createMessage({ role: undefined, name: undefined })),
      ).toBe("");
    });
  });

  describe("hasRenderableContent", () => {
    it("returns true when content is non-empty string", () => {
      expect(
        hasRenderableContent(createMessage({ role: "user", content: "Hello" })),
      ).toBe(true);
    });

    it("returns false when content is empty string", () => {
      expect(
        hasRenderableContent(createMessage({ role: "user", content: "" })),
      ).toBe(false);
    });

    it("returns false when content is null", () => {
      expect(
        hasRenderableContent(createMessage({ role: "user", content: null })),
      ).toBe(false);
    });

    it("returns true when audio is present", () => {
      expect(
        hasRenderableContent(
          createMessage({
            role: "user",
            content: "",
            audio: {
              data: {
                type: "base64",
                id: "1",
                source: "",
                referenceString: "",
              },
            },
          }),
        ),
      ).toBe(true);
    });
  });

  describe("hasAdditionalData", () => {
    it("returns false when only role and content present", () => {
      expect(
        hasAdditionalData(createMessage({ role: "user", content: "Hello" })),
      ).toBe(false);
    });

    it("returns true when tool_calls present", () => {
      expect(
        hasAdditionalData(
          createMessage({
            role: "assistant",
            content: "",
            tool_calls: [{ id: "1", name: "test", arguments: "{}" }],
          }),
        ),
      ).toBe(true);
    });

    it("returns true when json present", () => {
      expect(
        hasAdditionalData(
          createMessage({
            role: "user",
            content: "",
            json: { extra: "data" },
          }),
        ),
      ).toBe(true);
    });
  });

  describe("hasPassthroughJson", () => {
    it("returns true when json field is present", () => {
      expect(
        hasPassthroughJson(
          createMessage({
            role: "user",
            content: "",
            json: { data: "test" },
          }),
        ),
      ).toBe(true);
    });

    it("returns false when json field is not present", () => {
      expect(
        hasPassthroughJson(createMessage({ role: "user", content: "" })),
      ).toBe(false);
    });

    it("returns false when json is null", () => {
      expect(
        hasPassthroughJson(
          createMessage({ role: "user", content: "", json: null as any }),
        ),
      ).toBe(false);
    });
  });

  describe("isPlaceholderMessage", () => {
    it("returns true for placeholder type", () => {
      expect(
        isPlaceholderMessage(
          createMessage({
            role: "user",
            content: "",
            type: "placeholder",
          }),
        ),
      ).toBe(true);
    });

    it("returns false for non-placeholder", () => {
      expect(
        isPlaceholderMessage(createMessage({ role: "user", content: "" })),
      ).toBe(false);
    });
  });

  describe("isOnlyJsonMessage", () => {
    it("returns true when only json field present (no content, tool_calls, or audio)", () => {
      expect(
        isOnlyJsonMessage(
          createMessage({
            role: "assistant",
            content: undefined,
            json: { data: "test" },
          }),
        ),
      ).toBe(true);
    });

    it("returns false when content is present", () => {
      expect(
        isOnlyJsonMessage(
          createMessage({
            role: "assistant",
            content: "Hello",
            json: { data: "test" },
          }),
        ),
      ).toBe(false);
    });

    it("returns false when tool_calls present", () => {
      expect(
        isOnlyJsonMessage(
          createMessage({
            role: "assistant",
            tool_calls: [{ id: "1", name: "test", arguments: "{}" }],
            json: { data: "test" },
          }),
        ),
      ).toBe(false);
    });

    it("returns false when audio present", () => {
      expect(
        isOnlyJsonMessage(
          createMessage({
            role: "assistant",
            audio: {
              data: {
                type: "base64",
                id: "1",
                source: "",
                referenceString: "",
              },
            },
            json: { data: "test" },
          }),
        ),
      ).toBe(false);
    });

    it("returns false when no json present", () => {
      expect(
        isOnlyJsonMessage(
          createMessage({
            role: "assistant",
          }),
        ),
      ).toBe(false);
    });
  });

  describe("hasRenderableConversationMessages", () => {
    it("rejects empty-content passthrough JSON without changing all-data rendering", () => {
      const message = createMessage({
        role: "assistant",
        content: "",
        json: { data: "test" },
      });

      expect(hasRenderableConversationMessages([message], false)).toBe(false);
      expect(shouldRenderMessage(message)).toBe(true);
    });
  });

  describe("shouldRenderMessage", () => {
    it("returns true for message with content", () => {
      expect(
        shouldRenderMessage(createMessage({ role: "user", content: "Hello" })),
      ).toBe(true);
    });

    it("returns true for placeholder message", () => {
      expect(
        shouldRenderMessage(
          createMessage({
            role: "user",
            content: "",
            type: "placeholder",
          }),
        ),
      ).toBe(true);
    });

    it("returns true for message with additional data", () => {
      expect(
        shouldRenderMessage(
          createMessage({
            role: "assistant",
            content: "",
            tool_calls: [{ id: "1", name: "test", arguments: "{}" }],
          }),
        ),
      ).toBe(true);
    });

    it("returns false for empty message", () => {
      expect(
        shouldRenderMessage(createMessage({ role: "user", content: "" })),
      ).toBe(false);
    });
  });

  describe("parseToolCallsFromMessage", () => {
    it("returns tool_calls array when present", () => {
      const toolCalls = [{ id: "1", name: "test", arguments: "{}" }];
      expect(
        parseToolCallsFromMessage(
          createMessage({
            role: "assistant",
            content: "",
            tool_calls: toolCalls,
          }),
        ),
      ).toEqual(toolCalls);
    });

    it("returns json.tool_calls when tool_calls not present", () => {
      const toolCalls = [{ id: "2", name: "other" }];
      expect(
        parseToolCallsFromMessage(
          createMessage({
            role: "assistant",
            content: "",
            json: { tool_calls: toolCalls },
          }),
        ),
      ).toEqual(toolCalls);
    });

    it("returns empty array when no tool_calls", () => {
      expect(
        parseToolCallsFromMessage(
          createMessage({
            role: "assistant",
            content: "Hello",
          }),
        ),
      ).toEqual([]);
    });

    it("prefers direct tool_calls over json.tool_calls", () => {
      const directToolCalls = [{ id: "1", name: "direct", arguments: "{}" }];
      const jsonToolCalls = [{ id: "2", name: "json" }];
      expect(
        parseToolCallsFromMessage(
          createMessage({
            role: "assistant",
            content: "",
            tool_calls: directToolCalls,
            json: { tool_calls: jsonToolCalls },
          }),
        ),
      ).toEqual(directToolCalls);
    });
  });

  describe("shouldRenderMessageForContentMode", () => {
    const systemMessage = createMessage({
      role: "system",
      content: "Follow the support policy.",
    });
    const toolMessage = createMessage({
      role: "tool",
      content: "Order lookup complete.",
    });
    it("controls system prompts independently from inline data", () => {
      expect(
        shouldRenderMessageForContentMode(systemMessage, "conversation", false),
      ).toBe(false);
      expect(
        shouldRenderMessageForContentMode(systemMessage, "conversation", true),
      ).toBe(true);
      expect(
        shouldRenderMessageForContentMode(systemMessage, "all", false),
      ).toBe(false);
      expect(
        shouldRenderMessageForContentMode(systemMessage, "all", true),
      ).toBe(true);
      expect(
        shouldRenderMessageForContentMode(toolMessage, "conversation", true),
      ).toBe(false);
      expect(shouldRenderMessageForContentMode(toolMessage, "all", false)).toBe(
        true,
      );
    });

    it("preserves the existing defaults outside Modern Session", () => {
      expect(
        shouldRenderMessageForContentMode(systemMessage, "conversation"),
      ).toBe(false);
      expect(shouldRenderMessageForContentMode(systemMessage, "all")).toBe(
        true,
      );
    });
  });

  describe("isExplicitChatMessage", () => {
    it("returns true for array of message objects with role", () => {
      expect(
        isExplicitChatMessage([
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi" },
        ]),
      ).toBe(true);
    });

    it("returns true for array of objects with tool calls", () => {
      expect(
        isExplicitChatMessage([
          { tool_calls: [{ name: "search", id: "1" }] },
        ]),
      ).toBe(true);
    });

    it("returns true for record containing messages array", () => {
      expect(
        isExplicitChatMessage({
          messages: [{ role: "user", content: "hello" }],
        }),
      ).toBe(true);
    });

    it("returns true for single message object with valid role", () => {
      expect(isExplicitChatMessage({ role: "user", content: "hello" })).toBe(
        true,
      );
      expect(isExplicitChatMessage({ role: "assistant", content: "hi" })).toBe(
        true,
      );
      expect(isExplicitChatMessage({ role: "system", content: "prompt" })).toBe(
        true,
      );
      expect(isExplicitChatMessage({ role: "tool", content: "res" })).toBe(
        true,
      );
    });

    it("returns false for non-chat JSON values", () => {
      expect(isExplicitChatMessage(null)).toBe(false);
      expect(isExplicitChatMessage(undefined)).toBe(false);
      expect(isExplicitChatMessage([])).toBe(false);
      expect(isExplicitChatMessage("plain string")).toBe(false);
      expect(isExplicitChatMessage({ city: "London", temp: 20 })).toBe(false);
      expect(isExplicitChatMessage({ query: "find docs" })).toBe(false);
    });
  });

  describe("isChatConversation", () => {
    it("returns true when inputMessageCount > 1 (multi-turn conversation)", () => {
      expect(
        isChatConversation({
          messages: [
            createMessage({ role: "user", content: "one" }),
            createMessage({ role: "assistant", content: "two" }),
          ],
          inputMessageCount: 2,
        }),
      ).toBe(true);
    });

    it("returns true when input contains assistant or system message", () => {
      expect(
        isChatConversation({
          messages: [
            createMessage({ role: "assistant", content: "how can I help?" }),
          ],
          inputMessageCount: 1,
        }),
      ).toBe(true);
    });

    it("returns true when raw input is array of chat messages (issue #19198)", () => {
      expect(
        isChatConversation({
          input: [
            { role: "user", content: "hello" },
            { role: "assistant", content: "hi" },
          ],
          messages: [
            createMessage({ role: "user", content: "hello" }),
            createMessage({ role: "assistant", content: "hi" }),
          ],
          inputMessageCount: 2,
        }),
      ).toBe(true);
    });

    it("returns false for non-chat tool / span I/O", () => {
      expect(
        isChatConversation({
          input: { city: "London" },
          output: { temp: 20 },
          messages: [
            createMessage({ role: "user", json: { city: "London" } }),
            createMessage({ role: "assistant", json: { temp: 20 } }),
          ],
          inputMessageCount: 1,
        }),
      ).toBe(false);
    });

    it("returns false for plain string I/O", () => {
      expect(
        isChatConversation({
          input: "raw input query",
          output: "raw output result",
          messages: [
            createMessage({ role: "user", content: "raw input query" }),
            createMessage({ role: "assistant", content: "raw output result" }),
          ],
          inputMessageCount: 1,
        }),
      ).toBe(false);
    });
  });
});
