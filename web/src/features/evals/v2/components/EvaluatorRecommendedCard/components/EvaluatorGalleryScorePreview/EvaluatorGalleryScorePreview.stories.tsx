import preview from "../../../../../../../../.storybook/preview";
import { EvaluatorGalleryScorePreview } from "./EvaluatorGalleryScorePreview";
import { MANAGED_TEMPLATES_CATALOG } from "../../../../constants/managedTemplatesCatalog";

function catalogPreview(key: string) {
  const template = MANAGED_TEMPLATES_CATALOG.templates.find(
    (candidate) => candidate.key === key,
  );
  if (!template) throw new Error(`Catalog template ${key} not found`);
  return { scores: template.previewScores, type: template.evaluator.type };
}

const meta = preview.meta({
  component: EvaluatorGalleryScorePreview,
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
});

export const LlmAsAJudge = meta.story({
  args: catalogPreview("out-of-scope-request"),
});

export const DecisionModel = meta.story({
  args: catalogPreview("topic-decision-model"),
});

export const Code = meta.story({
  args: catalogPreview("exact-match"),
});

export const LongValue = meta.story({
  args: catalogPreview("context-precision"),
});

export const OverflowCount = meta.story({
  args: catalogPreview("conversation-signals"),
});
