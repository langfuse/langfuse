import { type ChatMlMessage } from "./chat-message-utils";
import {
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
} from "./chat-message-utils";

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
});
