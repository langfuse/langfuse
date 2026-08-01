import { fn } from "storybook/test";
import preview from "../../../../../../../.storybook/preview";
import { EvaluatorGallerySection } from "./EvaluatorGallerySection";
import type { GallerySection, GalleryTemplate } from "./types";

const template = {
  id: "template-1",
  name: "Answer relevance",
  type: "LLM",
  prompt: "Assess whether the answer directly addresses the question.",
  projectId: null,
  partner: null,
  updatedAt: new Date("2026-07-01"),
  version: 1,
} as unknown as GalleryTemplate;

const section: GallerySection = {
  key: "rag",
  label: "RAG",
  description: "Measure retrieval and answer quality.",
  templates: Array.from({ length: 7 }, (_, index) => ({
    ...template,
    id: `template-${index}`,
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
