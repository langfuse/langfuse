import preview from "../../../../../../../../../.storybook/preview";
import { InterpolatedPromptPreview } from "./InterpolatedPromptPreview";

const meta = preview.meta({ component: InterpolatedPromptPreview });

export const InterpolatedVariables = meta.story({
  args: {
    state: {
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

export const Unavailable = meta.story({
  args: {
    state: {
      status: "unavailable",
      message:
        "Pick a sample observation in the right pane to preview the interpolated prompt.",
    },
  },
});
