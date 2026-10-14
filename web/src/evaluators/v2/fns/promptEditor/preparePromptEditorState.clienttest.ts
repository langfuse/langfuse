import { describe, expect, it } from "vitest";

import { preparePromptEditorState } from "./preparePromptEditorState";

describe("preparePromptEditorState", () => {
  it("prepares sample-backed mapping and preview state", () => {
    expect(
      preparePromptEditorState({
        prompt: "Judge {{output}}",
        variableFields: {
          output: { selectedColumnId: "output", jsonSelector: "$.answer" },
        },
        promptPreviewEnabled: true,
        sampleObject: { output: { answer: "Looks good" } },
      }),
    ).toMatchObject({
      promptVariableMappings: { output: "Output" },
      promptVariableStatus: { output: { status: "valid" } },
      promptPreview: {
        status: "ready",
        fragments: [
          { type: "text", text: "Judge " },
          { type: "variable", name: "output", value: "Looks good" },
        ],
      },
    });
  });
});
