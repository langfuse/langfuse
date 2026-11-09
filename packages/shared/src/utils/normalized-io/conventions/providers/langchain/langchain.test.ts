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

  it("marks a LangChain server tool result with status error as failed", () => {
    const normalized = normalizeSpanIO({
      input: undefined,
      output: {
        role: "assistant",
        content: [
          {
            type: "server_tool_result",
            tool_call_id: "search_1",
            status: "error",
            output: "Search failed.",
          },
        ],
      },
      metadata: undefined,
    });

    expect(normalized.messages[0].parts).toEqual([
      {
        type: "tool-result",
        toolCallId: "search_1",
        output: { type: "text", value: "Search failed." },
        isError: true,
        providerMetadata: { status: "error" },
      },
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
