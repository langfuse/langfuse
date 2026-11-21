import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  capturedTraceFixtures,
  documentedPromptFixtures,
  vercelAiSdkMixedToolMessagesFixture,
  vercelAiSdkOutputToolCallFixture,
} from "./fixtures";

describe("AI SDK normalized I/O", () => {
  it.each([
    { type: "text", value: "business data", extra: "retain" },
    { type: "error-json", value: { status: "ok" }, extra: "retain" },
    {
      type: "content",
      value: [{ type: "text", text: "data" }],
      extra: "retain",
    },
  ])("preserves legacy result objects with type '$type'", (result) => {
    const input = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "lookup",
            result,
          },
        ],
      },
    ];

    const normalized = normalizeSpanIO({
      input: JSON.stringify(input),
      output: undefined,
      metadata: undefined,
    });

    expect(normalized.messages).toEqual([
      {
        role: "tool",
        source: "input",
        parts: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "lookup",
            output: { type: "json", value: result },
          },
        ],
      },
    ]);
  });

  it.each([
    {
      output: { type: "text", value: "answer" },
      expected: { output: { type: "text", value: "answer" } },
    },
    {
      output: { type: "error-json", value: { message: "failed" } },
      expected: {
        output: { type: "json", value: { message: "failed" } },
        isError: true,
      },
    },
  ])("keeps typed output '$output.type' handling", ({ output, expected }) => {
    const normalized = normalizeSpanIO({
      input: [
        {
          role: "tool",
          content: [{ type: "tool-result", toolCallId: "call-1", output }],
        },
      ],
      output: undefined,
      metadata: undefined,
    });

    expect(normalized.messages[0]?.parts).toEqual([
      {
        type: "tool-result",
        toolCallId: "call-1",
        ...expected,
      },
    ]);
  });

  it("retains explicit legacy error flags", () => {
    const result = { type: "text", value: "failure details", extra: "retain" };
    const normalized = normalizeSpanIO({
      input: [
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-1",
              result,
              isError: true,
            },
          ],
        },
      ],
      output: undefined,
      metadata: undefined,
    });

    expect(normalized.messages[0]?.parts).toEqual([
      {
        type: "tool-result",
        toolCallId: "call-1",
        output: { type: "json", value: result },
        isError: true,
      },
    ]);
  });

  it.each([
    ...capturedTraceFixtures,
    ...documentedPromptFixtures,
    vercelAiSdkMixedToolMessagesFixture,
    vercelAiSdkOutputToolCallFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
