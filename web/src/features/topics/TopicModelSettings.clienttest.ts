import { DEFAULT_TOPIC_FACETS, type TopicFacet } from "@langfuse/shared/topics";
import { describe, expect, it } from "vitest";
import { __test } from "./ConfigureTopicsDialogController";

const intentPreset = DEFAULT_TOPIC_FACETS.find(
  (facet) => facet.name === "Intent",
);
if (!intentPreset) throw new Error("Intent preset missing");

function facet(input: {
  id: string;
  name: string;
  isBuiltIn: boolean;
  description?: string;
  prompt: string;
}): TopicFacet {
  return {
    id: input.id,
    projectId: "project",
    name: input.name,
    description: input.description ?? "",
    isBuiltIn: input.isBuiltIn,
    versions: [
      {
        projectId: "project",
        facetId: input.id,
        version: 1,
        prompt: input.prompt,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

describe("facetDrafts", () => {
  it("keeps a built-in facet when a custom facet reuses its name", () => {
    const drafts = __test.facetDrafts(
      [
        facet({
          id: "built-in-intent",
          name: "Intent",
          isBuiltIn: true,
          description: "Stored built-in description.",
          prompt: "Built-in question",
        }),
        facet({
          id: "custom-intent",
          name: "Intent",
          isBuiltIn: false,
          description: "Custom description.",
          prompt: "Custom question",
        }),
      ],
      new Set(["built-in-intent"]),
    );

    expect(
      drafts.find((draft) => draft.builtIn && draft.name === "Intent"),
    ).toMatchObject({
      id: "built-in-intent",
      description: "Stored built-in description.",
      question: "Built-in question",
      enabled: true,
    });
    expect(drafts.filter((draft) => draft.id === "custom-intent")).toEqual([
      expect.objectContaining({
        name: "Intent",
        description: "Custom description.",
        question: "Custom question",
        builtIn: false,
        enabled: false,
      }),
    ]);
  });

  it("uses the preset description when a built-in has none stored", () => {
    const drafts = __test.facetDrafts(
      [
        facet({
          id: "built-in-intent",
          name: "Intent",
          isBuiltIn: true,
          description: "",
          prompt: "Built-in question",
        }),
      ],
      null,
    );

    expect(drafts.find((draft) => draft.name === "Intent")).toMatchObject({
      id: "built-in-intent",
      description: intentPreset.description,
      question: "Built-in question",
    });
  });
});
