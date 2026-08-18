import preview from "../../../../../../../../../.storybook/preview";
import { ExpectedOutputUsageHint } from "./ExpectedOutputUsageHint";

const meta = preview.meta({ component: ExpectedOutputUsageHint });

const keywordMatchHint = {
  shape:
    "expected_output must be a JSON object with an expected_keywords string array.",
  example: '{ "expected_keywords": ["refund", "invoice", "tracking number"] }',
};

export const Default = meta.story({
  args: { hint: keywordMatchHint },
});

export const ShapeOnly = meta.story({
  args: {
    hint: {
      shape:
        "expected_output must have the same value shape as output. Nested objects/arrays are supported.",
    },
  },
});
