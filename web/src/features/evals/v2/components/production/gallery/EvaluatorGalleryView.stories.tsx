import { FlaskConical } from "lucide-react";
import { fn } from "storybook/test";
import preview from "../../../../../../../.storybook/preview";
import { EvaluatorGalleryView } from "./EvaluatorGalleryView";
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

const sections: GallerySection[] = [
  {
    key: "rag",
    label: "RAG",
    description: "Measure retrieval and answer quality.",
    templates: Array.from({ length: 6 }, (_, index) => ({
      ...template,
      id: `template-${index + 1}`,
      name: `Evaluator example ${index + 1}`,
    })),
  },
];

const meta = preview.meta({ component: EvaluatorGalleryView });

const defaultArgs = {
  search: "",
  onSearchChange: fn(),
  navigationItems: [{ key: "rag", label: "RAG", icon: FlaskConical, count: 6 }],
  activeSection: "rag",
  onSelectSection: fn(),
  sections,
  expandedSections: new Set<string>(),
  onExpandedChange: fn(),
  onSelectTemplate: fn(),
  onCreateFromScratch: fn(),
  sectionRef: () => fn(),
  onScroll: fn(),
  isLoading: false,
};

export const Default = meta.story({
  args: defaultArgs,
});

export const Loading = meta.story({
  args: {
    ...defaultArgs,
    isLoading: true,
    sections: [],
  },
});

export const EmptySearch = meta.story({
  args: {
    ...defaultArgs,
    search: "does not exist",
    sections: [],
  },
});
