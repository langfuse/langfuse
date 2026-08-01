import { fn } from "storybook/test";
import preview from "../../../../../../../.storybook/preview";
import { EvaluatorTemplateCard } from "./EvaluatorTemplateCard";
import type { GalleryTemplate } from "./types";

const llmTemplate = {
  id: "template-1",
  name: "Answer relevance",
  type: "LLM",
  prompt: "Assess whether the answer directly addresses the question.",
  projectId: null,
  partner: null,
  updatedAt: new Date("2026-07-01"),
  version: 1,
} as unknown as GalleryTemplate;

const meta = preview.meta({ component: EvaluatorTemplateCard });

export const LangfuseMaintained = meta.story({
  args: { template: llmTemplate, onSelect: fn() },
});

export const ProjectCodeEvaluator = meta.story({
  args: {
    template: {
      ...llmTemplate,
      name: "Very long project evaluator name that truncates gracefully",
      type: "CODE",
      prompt: null,
      sourceCodeLanguage: "PYTHON",
      projectId: "project-1",
      createdByUser: { name: "Ada Lovelace", email: "ada@example.com" },
      version: 2,
    },
    onSelect: fn(),
  },
});
