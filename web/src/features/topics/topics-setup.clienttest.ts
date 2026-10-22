import { DEFAULT_TOPIC_FACETS } from "@langfuse/shared/topics";
import { describe, expect, it } from "vitest";
import type { ConfigureTopicsSaveDraft } from "./ConfigureTopicsDialog";
import { topicsSetupPayload } from "./topics-setup";

const slots = {
  summary: { llmApiKeyId: "key", model: "gpt" },
  embedding: { llmApiKeyId: "key", model: "embed" },
  embeddingDimensions: 1024,
  clustering: { llmApiKeyId: "key", model: "cluster" },
};

const draft: ConfigureTopicsSaveDraft = {
  summary: null,
  embedding: null,
  embeddingDimensions: "1024",
  clustering: null,
  idleSeconds: "120",
  filters: [
    { column: "name", type: "string", operator: "=", value: "billing" },
  ],
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
  it("keeps the filter and built-in enabled state", () => {
    expect(topicsSetupPayload(draft, slots)).toMatchObject({
      embeddingDimensions: 1024,
      traceIdleMs: 120_000,
      filter: draft.filters,
      facets: DEFAULT_TOPIC_FACETS.map((facet, index) => ({
        name: facet.name,
        enabled: index !== 1,
      })),
    });
  });

  it("accepts a Sentiment facet the project already has", () => {
    const sentiment = {
      id: "sentiment",
      name: "Sentiment",
      question: "How did the user feel?",
      builtIn: true,
      enabled: true,
    };
    expect(
      topicsSetupPayload(
        { ...draft, facets: [...draft.facets, sentiment] },
        slots,
      ).facets,
    ).toContainEqual({ name: "Sentiment", enabled: true });
  });

  it("rejects an unknown built-in facet", () => {
    const unknown = {
      id: "tone",
      name: "Tone",
      question: "What tone did the user use?",
      builtIn: true,
      enabled: true,
    };
    expect(() =>
      topicsSetupPayload(
        { ...draft, facets: [...draft.facets, unknown] },
        slots,
      ),
    ).toThrow(/each built-in facet once/);
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
