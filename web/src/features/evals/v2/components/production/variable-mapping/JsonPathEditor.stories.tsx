import { fn } from "storybook/test";
import preview from "../../../../../../../.storybook/preview";
import { JsonPathEditor } from "./JsonPathEditor";

const meta = preview.meta({ component: JsonPathEditor });

export const WithSuggestions = meta.story({
  args: {
    initialPath: "$.messages[*]",
    suggestions: [
      "$.messages[*].content",
      "$.messages[*].role",
      "$.metadata.model",
    ],
    onApply: fn(),
    onCancel: fn(),
  },
});

export const FullValue = meta.story({
  args: { initialPath: "$", suggestions: [], onApply: fn(), onCancel: fn() },
});
