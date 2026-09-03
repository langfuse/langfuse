import { LayoutGrid } from "lucide-react";
import {
  gallerySidebarItems,
  visibleGallerySections,
} from "./visibleGallerySections";
import type {
  GalleryNavigationItem,
  GallerySection,
  GalleryTemplate,
} from "@/src/features/evals/v2/types/templateGallery";

const template = {
  source: "managed",
  key: "answer-relevance",
  name: "Answer relevance",
  categories: ["quality"],
  icon: "gauge",
  description: "Assess whether the answer directly addresses the question.",
  maintainer: "langfuse",
  evaluator: {
    type: "LLM_AS_JUDGE",
    promptMessages: [{ role: "user", content: "Rate relevance." }],
    variables: [{ name: "query", defaultMapping: { field: "input" } }],
    outputDefinition: {
      dataType: "NUMERIC",
      score: { description: "Relevance." },
      reasoning: { description: "One sentence." },
    },
  },
} satisfies GalleryTemplate;

const customSection = {
  key: "custom",
  label: "Your templates",
  description: "Project templates.",
  totalCount: 12,
  templates: [
    {
      source: "custom",
      id: "evaluator-1",
      name: "Project exact match",
      type: "CODE",
      updatedAt: new Date("2026-08-11T10:00:00.000Z"),
      version: 1,
    },
  ],
} satisfies GallerySection;

const recommendedSection = {
  key: "recommended",
  label: "Recommended starting points",
  description: "Starter set.",
  templates: [
    { ...template, key: "chat-intent", name: "Classify chat intent" },
  ],
} satisfies GallerySection;

const qualitySection = {
  key: "quality",
  label: "Quality",
  description: "Quality checks.",
  templates: [template],
} satisfies GallerySection;

const navigationItems = [
  { key: "custom", label: "Your templates", count: 12 },
  { key: "recommended", label: "Recommended starting points", count: 1 },
  { key: "quality", label: "Quality", count: 1 },
] satisfies GalleryNavigationItem[];

describe("gallerySidebarItems", () => {
  it("adds All and keeps Your templates while hiding Recommended", () => {
    expect(
      gallerySidebarItems(navigationItems, [
        customSection,
        recommendedSection,
        qualitySection,
      ]),
    ).toEqual([
      { key: "all", label: "All", icon: LayoutGrid, count: 13 },
      { key: "custom", label: "Your templates", count: 12 },
      { key: "quality", label: "Quality", count: 1 },
    ]);
  });

  it("returns no sidebar items when a search matches nothing", () => {
    expect(gallerySidebarItems([], [])).toEqual([]);
  });
});

describe("visibleGallerySections", () => {
  const sections = [customSection, recommendedSection, qualitySection];

  it("puts recommended first when browsing all templates", () => {
    expect(
      visibleGallerySections(sections, "all").map((section) => section.key),
    ).toEqual(["recommended", "custom", "quality"]);
  });

  it("filters to the selected category including Your templates", () => {
    expect(
      visibleGallerySections(sections, "custom").map((section) => section.key),
    ).toEqual(["custom"]);
  });
});
