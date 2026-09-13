import { describe, expect, it } from "vitest";

import { buildInterpolatedPromptPreview } from "./buildInterpolatedPromptPreview";

describe("buildInterpolatedPromptPreview", () => {
  it("interpolates prompt variables from the selected sample", () => {
    expect(
      buildInterpolatedPromptPreview({
        prompt: "Input: {{input}}\nResponse: {{output}}",
        mappings: [
          {
            variable: "input",
            fieldState: { selectedColumnId: "input", jsonSelector: null },
          },
          {
            variable: "output",
            fieldState: { selectedColumnId: "output", jsonSelector: "$.text" },
          },
        ],
        sourceObject: {
          input: "Hello",
          output: { text: "Hi there" },
        },
      }),
    ).toEqual({
      status: "ready",
      fragments: [
        { type: "text", text: "Input: " },
        { type: "variable", name: "input", value: "Hello" },
        { type: "text", text: "\nResponse: " },
        { type: "variable", name: "output", value: "Hi there" },
      ],
    });
  });

  it("explains why preview is unavailable without a selected sample", () => {
    expect(
      buildInterpolatedPromptPreview({
        prompt: "Input: {{input}}",
        mappings: [
          {
            variable: "input",
            fieldState: { selectedColumnId: "input", jsonSelector: null },
          },
        ],
        sourceObject: null,
      }),
    ).toEqual({
      status: "unavailable",
      message:
        "Select a sample observation in the test panel to preview the interpolated prompt.",
    });
  });
});
