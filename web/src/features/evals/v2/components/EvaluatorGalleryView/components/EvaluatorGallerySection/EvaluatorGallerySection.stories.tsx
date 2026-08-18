import { useState } from "react";
import { expect, fn, userEvent } from "storybook/test";
import { EvalTemplateTypeEnum } from "@langfuse/shared";
import preview from "../../../../../../../../.storybook/preview";
import { EvaluatorGallerySection } from "./EvaluatorGallerySection";
import type {
  GallerySection,
  GalleryTemplate,
} from "../../../../types/templateGallery";

type EvaluatorGallerySectionProps = Parameters<
  typeof EvaluatorGallerySection
>[0];

function StatefulEvaluatorGallerySection(args: EvaluatorGallerySectionProps) {
  const [expanded, setExpanded] = useState(args.expanded);

  return (
    <EvaluatorGallerySection
      {...args}
      expanded={expanded}
      onExpandedChange={(nextExpanded) => {
        setExpanded(nextExpanded);
        args.onExpandedChange(nextExpanded);
      }}
    />
  );
}

const template = {
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

const listSection: GallerySection = {
  key: "quality",
  label: "Quality",
  description: "Measure retrieval and answer quality.",
  templates: Array.from({ length: 7 }, (_, index) => ({
    ...template,
    key: `quality-${index + 1}`,
    name: `Evaluator example ${index + 1}`,
  })),
};

const recommendedSection: GallerySection = {
  key: "recommended",
  label: "Recommended for you",
  description: "A curated starter set of templates.",
  templates: [
    { ...template, key: "chat-intent", name: "Classify chat intent" },
    {
      ...template,
      key: "out-of-scope-request",
      name: "Detect out-of-scope requests",
      icon: "shield",
    },
    { ...template, key: "language", name: "Detect language match" },
  ],
};

const meta = preview.meta({ component: EvaluatorGallerySection });

export const Collapsed = meta.story({
  args: {
    section: listSection,
    expanded: false,
    onExpandedChange: fn(),
    onSelectTemplate: fn(),
  },
  render: StatefulEvaluatorGallerySection,
});

export const Expanded = meta.story({
  args: {
    section: listSection,
    expanded: true,
    onExpandedChange: fn(),
    onSelectTemplate: fn(),
  },
  render: StatefulEvaluatorGallerySection,
});

export const Recommended = meta.story({
  args: {
    section: recommendedSection,
    expanded: false,
    onExpandedChange: fn(),
    onSelectTemplate: fn(),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Recommended for you" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Classify chat intent")).toBeInTheDocument();
    await expect(
      canvas.getByText("Detect out-of-scope requests"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Detect language match")).toBeInTheDocument();
    await expect(canvas.queryByText("Any application")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Set up")).not.toBeInTheDocument();
  },
});

export const ExpandsLongCategory = meta.story({
  name: "(Test) Expands a long category",
  args: {
    section: listSection,
    expanded: false,
    onExpandedChange: fn(),
    onSelectTemplate: fn(),
  },
  render: StatefulEvaluatorGallerySection,
  play: async ({ canvas, args }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Show all 7 templates" }),
    );
    await expect(args.onExpandedChange).toHaveBeenCalledWith(true);
    await expect(canvas.getByText("Evaluator example 7")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Show fewer" }),
    ).toBeInTheDocument();
  },
});
