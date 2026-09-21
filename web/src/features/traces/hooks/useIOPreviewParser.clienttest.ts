import { describe, expect, it } from "vitest";
import type { ChatMLParserResult, ChatMlMessage } from "./useChatMLParser";
import { hasRenderableChatMessages } from "./useIOPreviewParser";

const createMessage = (fields: Partial<ChatMlMessage>): ChatMlMessage =>
  fields as ChatMlMessage;

const result = (
  overrides: Partial<ChatMLParserResult> = {},
): ChatMLParserResult => ({
  canDisplayAsChat: true,
  allMessages: [createMessage({ role: "user", content: "hello" })],
  additionalInput: undefined,
  allTools: [],
  toolCallCounts: new Map(),
  toolCallsByName: new Map(),
  messageToToolCallNumbers: new Map(),
  toolNameToDefinitionNumber: new Map(),
  inputMessageCount: 1,
  ...overrides,
});

describe("hasRenderableChatMessages", () => {
  it("accepts a result with a text message", () => {
    expect(hasRenderableChatMessages(result())).toBe(true);
  });

  it("rejects a result that cannot display as chat", () => {
    expect(hasRenderableChatMessages(result({ canDisplayAsChat: false }))).toBe(
      false,
    );
  });

  it("treats a JSON-only message as not renderable chat", () => {
    expect(
      hasRenderableChatMessages(
        result({
          allMessages: [
            createMessage({
              role: "user",
              json: { raw: "value" },
            }),
          ],
        }),
      ),
    ).toBe(false);
  });
});
