import { describe, expect, it } from "vitest";
import type { ChatMLParserResult, ChatMlMessage } from "./useChatMLParser";
import {
  hasRenderableChatMessages,
  selectIOPreviewParserResult,
} from "./useIOPreviewParser";

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

describe("IO preview parser comparison", () => {
  it.each([
    ["both", result(), result()],
    ["normalized_only", result(), result({ canDisplayAsChat: false })],
    ["legacy_only", result({ canDisplayAsChat: false }), result()],
    [
      "neither",
      result({ canDisplayAsChat: false }),
      result({ canDisplayAsChat: false }),
    ],
  ] as const)("reports %s", (outcome, normalized, legacy) => {
    expect(
      selectIOPreviewParserResult(normalized, legacy).comparisonOutcome,
    ).toBe(outcome);
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

  it("falls back to legacy when normalized has no renderable messages", () => {
    const normalized = result({ canDisplayAsChat: false });
    const legacy = result();

    expect(selectIOPreviewParserResult(normalized, legacy)).toEqual({
      result: legacy,
      comparisonOutcome: "legacy_only",
    });
  });
});
