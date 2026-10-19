import { fn } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { EvaluationRuleAttachmentValidationAlert } from "./EvaluationRuleAttachmentValidationAlert";

const meta = preview.meta({
  component: EvaluationRuleAttachmentValidationAlert,
});

export const Default = meta.story({
  args: {
    message: "Two variables need a mapping before this evaluator can run.",
    onDismiss: fn(),
    reviewHref: "/project/example/evals/example",
  },
});
