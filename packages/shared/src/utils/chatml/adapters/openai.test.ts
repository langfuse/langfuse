import { describe, expect, it } from "vitest";
import { openAIAdapter } from "./openai";

describe("openAIAdapter preprocess", () => {
  const ctx = { metadata: undefined };

  it("preserves every output_text segment of a Responses API message", () => {
    // The Responses API returns an assistant message whose content array can
    // hold multiple output_text parts (e.g. text segments around web-search
    // citations). Only the first segment was rendered.
    const data = {
      choices: [],
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "The capital is Paris.",
              annotations: [],
            },
            {
              type: "output_text",
              text: " It is known for the Eiffel Tower.",
              annotations: [],
            },
          ],
        },
      ],
    };

    const result = openAIAdapter.preprocess(data, "output", ctx);

    expect(result).toEqual([
      {
        type: "message",
        role: "assistant",
        content: "The capital is Paris. It is known for the Eiffel Tower.",
      },
    ]);
  });

  it("keeps the single output_text part behavior unchanged", () => {
    const data = [
      {
        role: "assistant",
        content: [{ type: "output_text", text: "Hello!", annotations: [] }],
      },
    ];

    const result = openAIAdapter.preprocess(data, "output", ctx);

    expect(result).toEqual([{ role: "assistant", content: "Hello!" }]);
  });

  it("leaves content arrays that mix output_text with other part types untouched", () => {
    // Mixed arrays carry non-text parts (e.g. refusal) that must not be
    // silently dropped by the multi-segment extraction.
    const data = [
      {
        role: "assistant",
        content: [
          { type: "refusal", refusal: "I cannot help with that." },
          { type: "output_text", text: "Partial answer.", annotations: [] },
        ],
      },
    ];

    const result = openAIAdapter.preprocess(data, "output", ctx);

    expect(result).toEqual(data);
  });
});
