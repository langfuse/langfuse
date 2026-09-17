import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  anthropicChatMlThinkingSpellingFixture,
  anthropicMessagesRawServerToolsAndMediaFixture,
  anthropicMessagesRichContentFixture,
  capturedTraceFixtures,
  documentedToolResultFixtures,
} from "./fixtures";

describe("Anthropic normalized I/O", () => {
  it.each([
    ...capturedTraceFixtures,
    ...documentedToolResultFixtures,
    anthropicMessagesRawServerToolsAndMediaFixture,
    anthropicMessagesRichContentFixture,
    anthropicChatMlThinkingSpellingFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
