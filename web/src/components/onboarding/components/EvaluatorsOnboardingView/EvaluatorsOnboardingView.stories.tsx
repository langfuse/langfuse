import { fn } from "storybook/test";

import preview from "../../../../../.storybook/preview";
import { EvaluatorsOnboardingView } from "./EvaluatorsOnboardingView";

const meta = preview.meta({
  component: EvaluatorsOnboardingView,
});

export const Default = meta.story({
  args: {
    codeEvaluatorLanguageDescription: "TypeScript or Python",
    createEvaluatorAction: {
      label: "Create Evaluator",
      onClick: fn(),
    },
  },
});
