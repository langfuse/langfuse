import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  capturedTraceFixtures,
  langchainAiSdkFilePartFixture,
  langchainSerializedGenerationResultFixture,
  langchainBatchedMessagesFixture,
  langchainDictToolMessageFixture,
  langchainMultiBatchMessagesFixture,
  langchainSerializedEnvelopeFixture,
  langchainStandardMultimodalBlocksFixture,
  langchainStandardOutputBlocksFixture,
  langgraphProductionShapeFixture,
} from "./fixtures";

describe("LangChain normalized I/O", () => {
  it.each([
    ...capturedTraceFixtures,
    langchainSerializedGenerationResultFixture,
    langchainBatchedMessagesFixture,
    langchainMultiBatchMessagesFixture,
    langchainDictToolMessageFixture,
    langchainStandardMultimodalBlocksFixture,
    langchainStandardOutputBlocksFixture,
    langchainAiSdkFilePartFixture,
    langchainSerializedEnvelopeFixture,
    langgraphProductionShapeFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
