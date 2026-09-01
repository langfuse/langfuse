import { expect, fn } from "storybook/test";
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
  evaluator: {
    type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    promptMessages: [
      {
        role: "user",
        content: "Rate the relevance of {{generation}} to {{query}}.",
      },
    ],
    variables: [{ name: "query", defaultMapping: { field: "input" } }],
    outputDefinition: {
      dataType: "NUMERIC",
      score: { description: "Relevance." },
      reasoning: { description: "One sentence." },
    },
  },
} satisfies GalleryTemplate;

const meta = preview.meta({ component: EvaluatorTemplateRow });

export const CustomCodeEvaluator = meta.story({
  args: {
    template: {
      source: "custom",
      id: "evaluator-1",
      name: "Very long project evaluator name that truncates gracefully",
      type: EvalTemplateTypeEnum.CODE,
      sourceCodeLanguage: EvalTemplateSourceCodeLanguageEnum.PYTHON,
      updatedAt: new Date("2026-07-01"),
      version: 2,
      createdByUser: { name: "Ada Lovelace", email: "ada@example.com" },
    },
    onSelect: fn(),
  },
});

export const Managed = meta.story({
  name: "(Test) Managed",
  args: {
    template: managedTemplate,
    onSelect: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Answer relevance")).toBeInTheDocument();
    await expect(canvas.queryByText("NUMERIC")).not.toBeInTheDocument();
  },
});
