import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  capturedTraceFixtures,
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
  it("preserves the generic file URL fallback inside LangChain messages", () => {
    const normalized = normalizeSpanIO({
      input: undefined,
      output: {
        generations: [
          {
            message: {
              content: [
                {
                  type: "file",
                  url: "ZmlsZQ==",
                  mime_type: "application/pdf",
                },
              ],
            },
          },
        ],
      },
      metadata: undefined,
    });

    expect(normalized.messages[0].parts).toEqual([
      { type: "file", content: { kind: "base64", data: "ZmlsZQ==" } },
    ]);
  });

  it.each([
    ...capturedTraceFixtures,
    langchainSerializedGenerationResultFixture,
    langchainBatchedMessagesFixture,
    langchainMultiBatchMessagesFixture,
    langchainDictToolMessageFixture,
    langchainStandardMultimodalBlocksFixture,
    langchainStandardOutputBlocksFixture,
    langchainSerializedEnvelopeFixture,
    langgraphProductionShapeFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
