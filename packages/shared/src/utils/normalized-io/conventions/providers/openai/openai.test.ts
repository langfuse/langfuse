import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  capturedTraceFixtures,
  customerFixtures,
  documentedResponsesFixtures,
  openAiChatCompletionToolSequenceFixture,
  openAiChatMultimodalRichResponseFixture,
  openAiMessageLevelThinkingFixture,
  openAiResponsesBuiltInToolsAndMediaFixture,
  openAiResponsesFunctionCallFixture,
  openAiResponsesReasoningWithParallelCallsFixture,
} from "./fixtures";

describe("OpenAI normalized I/O", () => {
  it.each([
    ...capturedTraceFixtures,
    ...documentedResponsesFixtures,
    ...customerFixtures,
    openAiChatCompletionToolSequenceFixture,
    openAiChatMultimodalRichResponseFixture,
    openAiMessageLevelThinkingFixture,
    openAiResponsesFunctionCallFixture,
    openAiResponsesBuiltInToolsAndMediaFixture,
    openAiResponsesReasoningWithParallelCallsFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
