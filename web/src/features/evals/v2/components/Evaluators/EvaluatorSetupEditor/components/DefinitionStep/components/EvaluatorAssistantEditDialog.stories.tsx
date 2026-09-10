import { fn } from "storybook/test";

import preview from "../../../../../../../../../../../.storybook/preview";
import { EvaluatorAssistantEditDialog } from "./EvaluatorAssistantEditDialog";

const meta = preview.meta({ component: EvaluatorAssistantEditDialog });

const sharedArgs = {
  open: true,
  onOpenChange: fn(),
  onAssistantSubmit: fn(async () => true),
};

export const CodeEvaluator = meta.story({
  args: {
    ...sharedArgs,
    evaluatorType: "code",
  },
});

export const JudgeEvaluator = meta.story({
  args: {
    ...sharedArgs,
    evaluatorType: "judge",
  },
});
