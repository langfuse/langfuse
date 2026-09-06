import { fn, userEvent, expect } from "storybook/test";
import { EvalTemplateTypeEnum } from "@langfuse/shared";

import preview from "../../../../../../../../../../.storybook/preview";
import { EvaluatorRecommendedCard } from "./EvaluatorRecommendedCard";
import type { GalleryTemplate } from "../../../../../../types/templateGallery";

const template = {
  source: "managed",
  key: "chat-intent",
  name: "Classify chat intent",
  categories: ["conversation", "recommended"],
  icon: "message-square",
  description: "Classifies user questions into predefined intent buckets.",
  maintainer: "langfuse",
  evaluator: {
    type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    promptMessages: [{ role: "user", content: "Classify {{input}}." }],
    variables: [{ name: "input", defaultMapping: { field: "input" } }],
    outputDefinition: {
      dataType: "CATEGORICAL",
      score: {
        description: "Intent.",
        categories: ["Billing", "Support"],
        shouldAllowMultipleMatches: false,
      },
      reasoning: { description: "One sentence." },
    },
  },
} satisfies GalleryTemplate;

const meta = preview.meta({ component: EvaluatorRecommendedCard });

export const Default = meta.story({
  args: { template, onSelect: fn() },
});

export const SelectsTemplate = meta.story({
  name: "(Test) Selects a recommended template",
  args: { template, onSelect: fn() },
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: /Classify chat intent/ }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith(template);
  },
});
