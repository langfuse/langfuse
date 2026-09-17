import { describe, expect, it } from "vitest";
import type { NormalizedIO } from "@langfuse/shared/src/utils/normalized-io";
import { toIOPreview } from "./toIOPreview";

const emptySpan = { input: undefined, output: undefined, metadata: undefined };

describe("toIOPreview", () => {
  it("keeps media reference tokens in the renderer-compatible shape", () => {
    const mediaReference =
      "@@@langfuseMedia:type=image/png|id=file-1|source=bytes@@@";
    const io: NormalizedIO = {
      span: emptySpan,
      toolDefinitions: [],
      messages: [
        {
          role: "user",
          source: "input",
          parts: [
            { type: "text", text: "Look at this" },
            {
              type: "file",
              mediaType: "image/png",
              content: { kind: "reference", id: "file-1" },
              providerMetadata: { source: "bytes" },
            },
          ],
        },
      ],
    };

    expect(toIOPreview(io, {}).allMessages[0]?.content).toEqual([
      { type: "text", text: "Look at this" },
      { type: "image_url", image_url: { url: mediaReference } },
    ]);
  });

  it("pairs a tool result into its call entry instead of a standalone message", () => {
    const io: NormalizedIO = {
      span: emptySpan,
      toolDefinitions: [
        {
          name: "search",
          inputSchema: { type: "object" },
        },
      ],
      messages: [
        {
          role: "assistant",
          source: "output",
          parts: [
            {
              type: "reasoning",
              content: { kind: "text", text: "I should search first." },
            },
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "search",
              input: { query: "docs" },
            },
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "search",
              output: { matches: 1 },
            },
          ],
        },
      ],
    };

    const result = toIOPreview(io, {});

    expect(result.allMessages).toEqual([
      {
        role: "assistant",
        thinking: [{ type: "thinking", content: "I should search first." }],
        tool_calls: [
          {
            id: "call-1",
            name: "search",
            arguments: { query: "docs" },
            // The paired result renders inside the call card; no standalone
            // tool message is emitted for it.
            response: { output: { matches: 1 } },
          },
        ],
      },
    ]);
    expect(result.inputMessageCount).toBe(0);
    expect(result.toolCallCounts.get("search")).toBe(1);
    expect(result.toolNameToDefinitionNumber.get("search")).toBe(1);
  });

  it("keeps unmatched tool results standalone and unanswered calls at null", () => {
    const io: NormalizedIO = {
      span: emptySpan,
      toolDefinitions: [],
      messages: [
        {
          role: "assistant",
          source: "output",
          parts: [
            {
              type: "tool-call",
              toolCallId: "call-a",
              toolName: "search",
              input: { query: "a" },
            },
            {
              type: "tool-call",
              toolCallId: "call-b",
              toolName: "search",
              input: { query: "b" },
            },
          ],
        },
        {
          role: "tool",
          source: "output",
          parts: [
            {
              type: "tool-result",
              toolCallId: "call-a",
              output: "boom",
              isError: true,
            },
            {
              type: "tool-result",
              toolCallId: "call-unknown",
              output: "orphaned",
            },
          ],
        },
      ],
    };

    const result = toIOPreview(io, {});

    expect(result.allMessages).toEqual([
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call-a",
            name: "search",
            arguments: { query: "a" },
            response: { output: "boom", isError: true },
          },
          {
            id: "call-b",
            name: "search",
            arguments: { query: "b" },
            // Unanswered call: explicit null renders as "No response".
            response: null,
          },
        ],
      },
      {
        // Result without a matching call stays a standalone tool message so
        // nothing is dropped.
        role: "tool",
        tool_call_id: "call-unknown",
        content: "orphaned",
      },
    ]);
  });
});
