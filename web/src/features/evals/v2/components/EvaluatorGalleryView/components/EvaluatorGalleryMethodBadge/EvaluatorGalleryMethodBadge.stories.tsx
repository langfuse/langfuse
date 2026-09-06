import preview from "../../../../../../../../.storybook/preview";
import { EvaluatorGalleryMethodBadge } from "./EvaluatorGalleryMethodBadge";

const meta = preview.meta({ component: EvaluatorGalleryMethodBadge });

export const LlmJudge = meta.story({
  args: { type: "LLM_AS_JUDGE" },
});

export const Code = meta.story({
  args: { type: "CODE" },
});
