import preview from "../../../../../../../.storybook/preview";
import { EvaluatorTypeBadge } from "./EvaluatorTypeBadge";

const meta = preview.meta({ component: EvaluatorTypeBadge });

export const LlmAsJudge = meta.story({
  args: { type: "LLM_AS_JUDGE" },
});

export const Code = meta.story({
  args: { type: "CODE" },
});
