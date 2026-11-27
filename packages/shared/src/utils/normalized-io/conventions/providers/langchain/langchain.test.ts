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
} from "./__tests__/fixtures";

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

  it("normalizes LangChain v1 StructuredTool definitions from callback messages and tools", () => {
    const spanIO = {
      input: {
        messages: [
          { role: "user", content: "Search for LangChain 1.0" },
          {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_1",
                name: "example_tool",
                args: { query: "LangChain 1.0" },
                type: "tool_call",
              },
            ],
          },
          {
            role: "tool",
            name: "example_tool",
            tool_call_id: "call_1",
            content: "Found release notes.",
          },
          {
            role: "tool",
            content: {
              name: "example_tool",
              description: "Example tool description",
              args_schema: {
                type: "object",
                properties: {
                  query: { type: "string" },
                },
                required: ["query"],
              },
              return_direct: false,
              verbose: false,
            },
          },
        ],
        tools: [
          {
            name: "followup_tool",
            description: "Follow-up tool description",
            args_schema: {
              type: "object",
              properties: {
                topic: { type: "string" },
              },
              required: ["topic"],
            },
            return_direct: false,
          },
        ],
      },
      output: {
        role: "assistant",
        content: "Here is a summary of LangChain 1.0.",
      },
      metadata: undefined,
    };

    expect(normalizeSpanIO(spanIO)).toEqual({
      messages: [
        {
          role: "user",
          source: "input",
          parts: [{ type: "text", text: "Search for LangChain 1.0" }],
        },
        {
          role: "assistant",
          source: "input",
          parts: [
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "example_tool",
              input: { query: "LangChain 1.0" },
              toolType: "tool_call",
            },
          ],
        },
        {
          role: "tool",
          source: "input",
          parts: [
            {
              type: "tool-result",
              toolCallId: "call_1",
              toolName: "example_tool",
              output: { type: "text", value: "Found release notes." },
            },
          ],
        },
        {
          role: "assistant",
          source: "output",
          parts: [
            { type: "text", text: "Here is a summary of LangChain 1.0." },
          ],
        },
      ],
      toolDefinitions: [
        {
          name: "followup_tool",
          description: "Follow-up tool description",
          inputSchema: {
            type: "object",
            properties: {
              topic: { type: "string" },
            },
            required: ["topic"],
          },
          providerMetadata: { return_direct: false },
        },
        {
          name: "example_tool",
          description: "Example tool description",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
            required: ["query"],
          },
          providerMetadata: { return_direct: false, verbose: false },
        },
      ],
      span: spanIO,
    });
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
