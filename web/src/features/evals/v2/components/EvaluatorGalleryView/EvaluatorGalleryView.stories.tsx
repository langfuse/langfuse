import { useState } from "react";
import { User } from "lucide-react";
import { expect, fn, userEvent, waitFor } from "storybook/test";
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

const customTemplate = {
  source: "custom",
  id: "evaluator-1",
  name: "Project exact match",
  type: EvalTemplateTypeEnum.CODE,
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
    label: "Recommended starting points",
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
    key: "conversation",
    label: "Conversational / Chatbots",
    description: "Signals for chatbot-style interactions.",
    templates: [
      {
        ...managedTemplate,
        key: "language",
        name: "Check language match",
        icon: "languages",
        description: "Does the reply use the language the user wrote in?",
        categories: ["conversation"],
      },
      {
        ...managedTemplate,
        key: "user-distress",
        name: "Detect user distress",
        icon: "frown",
        description: "Flag conversations where the user sounds upset or stuck.",
        categories: ["conversation"],
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
    { key: "recommended", label: "Recommended starting points", count: 3 },
    { key: "conversation", label: "Conversational / Chatbots", count: 2 },
    { key: "quality", label: "Quality", count: 7 },
  ],
  activeSection: EVALUATOR_GALLERY_ALL_SECTION_KEY,
  onSelectSection: fn(),
  sections,
  expandedSections: new Set<string>(),
  onExpandedChange: fn(),
  onSelectTemplate: fn(),
  onCreateFromScratch: fn(),
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

export const LoadsMoreYourTemplates = meta.story({
  name: "(Test) Loads more Your templates",
  args: {
    ...defaultArgs,
    activeSection: "custom",
    navigationItems: defaultArgs.navigationItems.map((item) =>
      item.key === "custom" ? { ...item, count: 51 } : item,
    ),
    sections: sections.map((section) =>
      section.key === "custom" ? { ...section, totalCount: 51 } : section,
    ),
    hasMoreProjectTemplates: true,
    onLoadMoreProjectTemplates: fn(),
  },
  render: StatefulEvaluatorGalleryView,
  play: async ({ args }) => {
    await waitFor(() =>
      expect(args.onLoadMoreProjectTemplates).toHaveBeenCalledOnce(),
    );
  },
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
  name: "(Test) Empty search",
  args: {
    ...defaultArgs,
    search: "does not exist",
    sections: [],
    navigationItems: defaultArgs.navigationItems.map((item) => ({
      ...item,
      count: 0,
    })),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("No templates match your search."),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Browse")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Quality 0" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "New LLM-as-a-judge" }),
    ).toBeInTheDocument();
  },
});

export const SelectsCategory = meta.story({
  name: "(Test) Selects a category",
  args: {
    ...defaultArgs,
    search: "quality",
  },
  render: StatefulEvaluatorGalleryView,
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Quality 7" }));
    await expect(args.onSearchChange).toHaveBeenCalledWith("");
    await expect(args.onSelectSection).toHaveBeenCalledWith("quality");
    await expect(
      canvas.getByRole("heading", { name: "Quality" }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Recommended starting points" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Your templates" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: /Quality evaluator 7/ }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Show all 7 templates" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Show fewer" }),
    ).not.toBeInTheDocument();
  },
});
