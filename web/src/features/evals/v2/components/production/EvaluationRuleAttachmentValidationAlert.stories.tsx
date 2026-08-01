import { fn } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import { EvaluationRuleAttachmentValidationAlert } from "./EvaluationRuleAttachmentValidationAlert";

const meta = preview.meta({
  component: EvaluationRuleAttachmentValidationAlert,
});
const issue = {
  outcome: "failed" as const,
  message: "Two variables need a mapping before this evaluator can run.",
  requiresMappingReview: true as const,
};

export const Default = meta.story({
  args: {
    issue,
    onDismiss: fn(),
    reviewHref: "/project/example/evals/v2/example",
  },
});
