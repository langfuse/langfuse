import { useState } from "react";
import { User } from "lucide-react";
import { expect, fn, userEvent } from "storybook/test";
import { EvalTemplateTypeEnum } from "@langfuse/shared";
import preview from "../../../../../../.storybook/preview";
import { EvaluatorGalleryView } from "./EvaluatorGalleryView";
import type {
  GallerySection,
  GalleryTemplate,
} from "../../types/templateGallery";
import { EVALUATOR_GALLERY_ALL_SECTION_KEY } from "../../constants/evaluatorGallery";

type EvaluatorGalleryViewProps = Parameters<typeof EvaluatorGalleryView>[0];

function StatefulEvaluatorGalleryView(args: EvaluatorGalleryViewProps) {
  const [search, setSearch] = useState(args.search);
  const [activeSection, setActiveSection] = useState(args.activeSection);
  const [expandedSections, setExpandedSections] = useState(
    () => new Set(args.expandedSections),
  );

  return (
    <EvaluatorGalleryView
      {...args}
      search={search}
      activeSection={activeSection}
      expandedSections={expandedSections}
      onSearchChange={(value) => {
        setSearch(value);
        args.onSearchChange(value);
      }}
      onSelectSection={(key) => {
        setActiveSection(key);
        args.onSelectSection(key);
      }}
      onExpandedChange={(key, expanded) => {
        setExpandedSections((current) => {
          const next = new Set(current);
          if (expanded) next.add(key);
          else next.delete(key);
          return next;
        });
        args.onExpandedChange(key, expanded);
      }}
    />
  );
}

const managedTemplate = {
  source: "managed",
  key: "answer-relevance",
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

const customTemplate = {
  source: "custom",
  id: "evaluator-1",
  name: "Project exact match",
  type: EvalTemplateTypeEnum.CODE,
  prompt: null,
  sourceCodeLanguage: "TYPESCRIPT",
  updatedAt: new Date("2026-07-01"),
  version: 2,
  createdByUser: { name: "Ada Lovelace", email: "ada@example.com" },
} satisfies GalleryTemplate;

const sections: GallerySection[] = [
  {
    key: "custom",
    label: "Your templates",
    description: "Start from a template this project already created.",
    totalCount: 2,
    templates: [
      customTemplate,
      { ...customTemplate, id: "evaluator-2", name: "Support classifier" },
    ],
  },
  {
    key: "recommended",
    label: "Recommended for you",
    description: "A curated starter set of templates.",
    templates: [
      {
        ...managedTemplate,
        key: "chat-intent",
        name: "Classify chat intent",
        icon: "message-square",
        categories: ["conversation", "recommended"],
        evaluator: {
          ...managedTemplate.evaluator,
          outputDefinition: {
            version: 2,
            dataType: "CATEGORICAL",
            score: {
              description: "Intent.",
              categories: ["Billing", "Support"],
              shouldAllowMultipleMatches: false,
            },
            reasoning: { description: "One sentence." },
          },
        },
      },
      {
        ...managedTemplate,
        key: "out-of-scope-request",
        name: "Detect out-of-scope requests",
        icon: "shield",
        categories: ["conversation", "recommended"],
        evaluator: {
          ...managedTemplate.evaluator,
          outputDefinition: {
            version: 2,
            dataType: "BOOLEAN",
            score: { description: "Out of scope." },
            reasoning: { description: "One sentence." },
          },
        },
      },
      {
        ...managedTemplate,
        key: "language",
        name: "Detect language match",
        icon: "languages",
        categories: ["conversation", "recommended"],
      },
    ],
  },
  {
    key: "quality",
    label: "Quality",
    description: "Checks response quality.",
    templates: Array.from({ length: 7 }, (_, index) => ({
      ...managedTemplate,
      key: `quality-${index + 1}`,
      name: `Quality evaluator ${index + 1}`,
    })),
  },
];

const meta = preview.meta({ component: EvaluatorGalleryView });

const defaultArgs = {
  search: "",
  onSearchChange: fn(),
  navigationItems: [
    { key: "custom", label: "Your templates", icon: User, count: 2 },
    { key: "recommended", label: "Recommended for you", count: 3 },
    { key: "quality", label: "Quality", count: 7 },
  ],
  activeSection: EVALUATOR_GALLERY_ALL_SECTION_KEY,
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
  render: StatefulEvaluatorGalleryView,
});

export const YourTemplates = meta.story({
  args: {
    ...defaultArgs,
    activeSection: "custom",
  },
  render: StatefulEvaluatorGalleryView,
});

export const Loading = meta.story({
  args: {
    ...defaultArgs,
    isLoading: true,
    sections: [],
    navigationItems: [],
  },
});

export const EmptySearch = meta.story({
  args: {
    ...defaultArgs,
    search: "does not exist",
    sections: [],
    navigationItems: [],
  },
});

export const SelectsCategory = meta.story({
  name: "(Test) Selects a category",
  args: defaultArgs,
  render: StatefulEvaluatorGalleryView,
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Quality 7" }));
    await expect(args.onSelectSection).toHaveBeenCalledWith("quality");
    await expect(
      canvas.getByRole("heading", { name: "Quality" }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Recommended for you" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Your templates" }),
    ).not.toBeInTheDocument();
  },
});
