import { fn } from "storybook/test";
import {
  EvalTemplateSourceCodeLanguageEnum,
  EvalTemplateTypeEnum,
} from "@langfuse/shared";

import preview from "../../../../../../../../../../.storybook/preview";
import { EvaluatorTemplateRow } from "./EvaluatorTemplateRow";
import type { GalleryTemplate } from "../../../../../../types/templateGallery";

const managedTemplate = {
  source: "managed",
  key: "hallucination",
  name: "Answer relevance",
  categories: ["quality"],
  icon: "gauge",
  description: "Assess whether the answer directly addresses the question.",
  maintainer: "langfuse",
  runsOn: ["experiment", "live-observations"],
  evaluator: {
    type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    prompt: "Rate the relevance of {{generation}} to {{query}}.",
    variables: [{ name: "query", defaultMapping: { field: "input" } }],
    outputDefinition: {
      version: 2,
      dataType: "NUMERIC",
      score: { description: "Relevance." },
      reasoning: { description: "One sentence." },
    },
  },
} satisfies GalleryTemplate;

const meta = preview.meta({ component: EvaluatorTemplateRow });

export const Managed = meta.story({
  args: { template: managedTemplate, onSelect: fn() },
});

export const CustomCodeEvaluator = meta.story({
  args: {
    template: {
      source: "custom",
      id: "evaluator-1",
      name: "Very long project evaluator name that truncates gracefully",
      type: EvalTemplateTypeEnum.CODE,
      prompt: null,
      sourceCodeLanguage: EvalTemplateSourceCodeLanguageEnum.PYTHON,
      updatedAt: new Date("2026-07-01"),
      version: 2,
      createdByUser: { name: "Ada Lovelace", email: "ada@example.com" },
    },
    onSelect: fn(),
  },
});
