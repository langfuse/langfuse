import { fn } from "storybook/test";
import { EvalTemplateTypeEnum } from "@langfuse/shared";
import preview from "../../../../../../../../.storybook/preview";
import { EvaluatorGallerySection } from "./EvaluatorGallerySection";
import type { GallerySection, GalleryTemplate } from "../../types";

const template = {
  source: "managed",
  name: "Answer relevance",
  category: "quality",
  icon: "gauge",
  description: "Assess whether the answer directly addresses the question.",
  maintainer: "langfuse",
  evaluator: {
    type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    prompt: "Rate the relevance of {{generation}} to {{query}}.",
    variables: [{ name: "query", defaultMapping: { field: "input" } }],
    outputDefinition: {
      dataType: "NUMERIC",
      score: { description: "Relevance.", minValue: 0, maxValue: 1 },
      reasoning: { description: "One sentence." },
    },
  },
} satisfies GalleryTemplate;

const section: GallerySection = {
  key: "rag",
  label: "RAG",
  description: "Measure retrieval and answer quality.",
  templates: Array.from({ length: 7 }, (_, index) => ({
    ...template,
    name: `Evaluator example ${index + 1}`,
  })),
};

const meta = preview.meta({ component: EvaluatorGallerySection });

export const Collapsed = meta.story({
  args: {
    section,
    expanded: false,
    onExpandedChange: fn(),
    onSelectTemplate: fn(),
  },
});

export const Expanded = meta.story({
  args: {
    section,
    expanded: true,
    onExpandedChange: fn(),
    onSelectTemplate: fn(),
  },
});
