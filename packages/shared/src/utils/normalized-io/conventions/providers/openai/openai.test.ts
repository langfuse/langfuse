import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import { normalizedMessageSchema } from "../../../schema";
import {
  capturedTraceFixtures,
  customerFixtures,
  documentedResponsesFixtures,
  openAiChatCompletionToolSequenceFixture,
  openAiChatMultimodalRichResponseFixture,
  openAiMessageReasoningFixture,
  openAiResponsesBuiltInToolsAndMediaFixture,
  openAiResponsesFunctionCallFixture,
  openAiResponsesReasoningWithParallelCallsFixture,
} from "./fixtures";

describe("OpenAI normalized I/O", () => {
  it.each([
    ...capturedTraceFixtures,
    ...documentedResponsesFixtures,
    ...customerFixtures,
    openAiMessageReasoningFixture,
    openAiChatCompletionToolSequenceFixture,
    openAiChatMultimodalRichResponseFixture,
    openAiResponsesFunctionCallFixture,
    openAiResponsesBuiltInToolsAndMediaFixture,
    openAiResponsesReasoningWithParallelCallsFixture,
  ])("$name", ({ spanIO, expected }) => {
    const actual = normalizeSpanIO(spanIO);
    expect(actual).toEqual({
      ...expected,
      span: spanIO,
    });
    expect(normalizedMessageSchema.array().parse(actual.messages)).toEqual(
      actual.messages,
    );
  });
});
