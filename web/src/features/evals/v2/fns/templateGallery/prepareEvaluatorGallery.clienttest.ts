import { prepareEvaluatorGallery } from "@/src/features/evals/v2/fns/templateGallery/prepareEvaluatorGallery";

const customTemplate = {
  id: "evaluator-1",
  name: "Project exact match",
  type: "CODE" as const,
  sourceCodeLanguage: "TYPESCRIPT" as const,
  updatedAt: new Date("2026-08-11T10:00:00.000Z"),
  version: 1,
  createdByUser: null,
};

describe("prepareEvaluatorGallery", () => {
  it("groups project and managed examples for navigation", () => {
    const gallery = prepareEvaluatorGallery({
      customTemplates: [customTemplate],
      customTemplateCount: 12,
      search: "",
    });

    expect(gallery.navigationItems[0]).toMatchObject({
      key: "custom",
      count: 12,
    });
    expect(gallery.sections[0]?.totalCount).toBe(12);
    expect(gallery.sections.map(({ key }) => key)).toEqual([
      "custom",
      "recommended",
      "conversation",
      "quality",
      "classifier",
      "retrieval",
      "safety",
      "coding-agents",
    ]);

    const recommendedSection = gallery.sections.find(
      ({ key }) => key === "recommended",
    );
    expect(
      recommendedSection?.templates.map((template) =>
        template.source === "managed" ? template.key : null,
      ),
    ).toEqual([
      "topic-classifier",
      "out-of-scope-request",
      "quality-criterion",
    ]);
    const conversationSection = gallery.sections.find(
      ({ key }) => key === "conversation",
    );
    expect(
      conversationSection?.templates.map((template) =>
        template.source === "managed" ? template.key : null,
      ),
    ).toEqual([
      "chat-intent",
      "out-of-scope-request",
      "user-disagreement",
      "all-caps",
      "user-distress",
    ]);
  });

  it("searches custom and managed template descriptions", () => {
    const gallery = prepareEvaluatorGallery({
      customTemplates: [customTemplate],
      customTemplateCount: 0,
      search: "grounded",
    });

    expect(
      gallery.navigationItems.map(({ key, count }) => ({ key, count })),
    ).toEqual([
      { key: "custom", count: 0 },
      { key: "recommended", count: 0 },
      { key: "conversation", count: 0 },
      { key: "quality", count: 0 },
      { key: "classifier", count: 0 },
      { key: "retrieval", count: 1 },
      { key: "safety", count: 0 },
      { key: "coding-agents", count: 0 },
    ]);
    expect(gallery.sections).toHaveLength(1);
    expect(gallery.sections[0]?.templates).toEqual([
      expect.objectContaining({
        source: "managed",
        key: "answer-groundedness",
      }),
    ]);
  });
});
