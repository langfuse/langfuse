import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";
import { describe, expect, it } from "vitest";
import type { ConfigureTopicsSaveDraft } from "./ConfigureTopicsDialog";
import { topicsSetupPayload } from "./topics-setup";

const slots = {
  summary: { provider: "key", model: "gpt" },
  embedding: { provider: "key", model: "embed" },
  embeddingDimensions: 1024,
  clustering: { provider: "key", model: "cluster" },
};

const draft: ConfigureTopicsSaveDraft = {
  summary: null,
  embedding: null,
  embeddingDimensions: "1024",
  clustering: null,
  idleSeconds: "120",
  facets: [
    ...DEFAULT_TOPIC_FACETS.map((facet, index) => ({
      id: facet.name,
      name: facet.name,
      question: facet.prompt,
      builtIn: true,
      enabled: index !== 1,
    })),
    {
      id: "custom",
      name: "Frustration",
      question: "Is the user frustrated?",
      builtIn: false,
      enabled: true,
    },
  ],
};

describe("topicsSetupPayload", () => {
  it("keeps the built-in enabled state and never sends a rule filter", () => {
    const payload = topicsSetupPayload(draft, slots);
    // Configure Topics must not replace the filter chosen in setup.
    expect(payload).not.toHaveProperty("filter");
    expect(payload).toMatchObject({
      embeddingDimensions: 1024,
      traceIdleMs: 120_000,
      facets: DEFAULT_TOPIC_FACETS.map((facet, index) => ({
        name: facet.name,
        enabled: index !== 1,
      })),
    });
  });

  it("saves without models", () => {
    expect(
      topicsSetupPayload(draft, {
        ...slots,
        summary: null,
        embedding: null,
        clustering: null,
      }),
    ).toMatchObject({
      summary: null,
      embedding: null,
      clustering: null,
    });
  });

  it("rejects a setup with every built-in facet turned off", () => {
    expect(() =>
      topicsSetupPayload(
        {
          ...draft,
          facets: draft.facets.map((facet) => ({ ...facet, enabled: false })),
        },
        slots,
      ),
    ).toThrow(/at least one facet/);
  });

  it("rejects an idle time below 60 seconds", () => {
    expect(() =>
      topicsSetupPayload({ ...draft, idleSeconds: "59" }, slots),
    ).toThrow();
  });
});
