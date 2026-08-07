import { fn } from "storybook/test";

import preview from "../../../../../../../../.storybook/preview";
import { PromptVariableEditor } from "./PromptVariableEditor";

const meta = preview.meta({ component: PromptVariableEditor });

export const Default = meta.story({
  args: {
    value: "Evaluate whether the response answers the user's question.",
    onChange: fn(),
    showPreviewToggle: true,
    previewEnabled: false,
    onPreviewEnabledChange: fn(),
  },
});

export const MappedVariables = meta.story({
  args: {
    value:
      "Compare {{input}} with {{output}} and explain whether the response is correct.",
    onChange: fn(),
    variableStatus: {
      input: { status: "valid" },
      output: {
        status: "invalid",
        message: "Output is not mapped to the sample observation",
      },
    },
    variableMappings: {
      input: "Observation input",
      output: "Not mapped",
    },
    showPreviewToggle: true,
    previewEnabled: false,
    onPreviewEnabledChange: fn(),
  },
});

export const Preview = meta.story({
  args: {
    value:
      "Question: {{input}}\nResponse: {{output}}\n\nEvaluate whether the response is correct.",
    onChange: fn(),
    variableStatus: {
      input: { status: "valid" },
      output: { status: "valid" },
    },
    variableMappings: {
      input: "Observation input",
      output: "Observation output",
    },
    showPreviewToggle: true,
    previewEnabled: true,
    onPreviewEnabledChange: fn(),
    preview: {
      status: "ready",
      fragments: [
        { type: "text", text: "Question: " },
        {
          type: "variable",
          name: "input",
          value: "What is the capital of France?",
        },
        { type: "text", text: "\nResponse: " },
        {
          type: "variable",
          name: "output",
          value: "The capital of France is Paris.",
        },
        {
          type: "text",
          text: "\n\nEvaluate whether the response is correct.",
        },
      ],
    },
  },
});

export const ReadOnly = meta.story({
  args: {
    value: "Return a score for {{output}} and explain the evidence behind it.",
    onChange: fn(),
    variableStatus: { output: { status: "valid" } },
    variableMappings: { output: "Observation output" },
    readOnly: true,
  },
});
