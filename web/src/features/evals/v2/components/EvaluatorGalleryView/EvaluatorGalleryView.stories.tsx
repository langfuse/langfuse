import { FlaskConical } from "lucide-react";
import { fn } from "storybook/test";
import { EvalTemplateTypeEnum } from "@langfuse/shared";
import preview from "../../../../../../.storybook/preview";
import { EvaluatorGalleryView } from "./EvaluatorGalleryView";
import type {
  GallerySection,
  GalleryTemplate,
} from "../../types/templateGallery";

const template = {
  source: "managed",
  key: "answer-relevance",
  name: "Answer relevance",
  category: "quality",
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

const sections: GallerySection[] = [
  {
    key: "rag",
    label: "RAG",
    description: "Measure retrieval and answer quality.",
    templates: Array.from({ length: 6 }, (_, index) => ({
      ...template,
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
