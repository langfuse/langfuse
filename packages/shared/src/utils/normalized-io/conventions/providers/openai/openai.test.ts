import { capturedTraceFixtures } from "./fixtures";
import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  openAiChatCompletionToolSequenceFixture,
  openAiChatMultimodalRichResponseFixture,
  openAiResponsesBuiltInToolsAndMediaFixture,
  openAiResponsesFunctionCallFixture,
  openAiResponsesReasoningWithParallelCallsFixture,
} from "./fixtures";

describe("OpenAI normalized I/O", () => {
  it.each([
    ...capturedTraceFixtures,
    openAiChatCompletionToolSequenceFixture,
    openAiChatMultimodalRichResponseFixture,
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
