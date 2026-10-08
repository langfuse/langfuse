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
  sampling: 0.25,
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
  it("keeps the filter, sampling, idle time, and built-in enabled state", () => {
    expect(topicsSetupPayload(draft, slots)).toMatchObject({
      enabled: true,
      embeddingDimensions: 1024,
      sampling: 0.25,
      idleSeconds: 120,
      filter: draft.filters,
      facets: DEFAULT_TOPIC_FACETS.map((facet, index) => ({
        name: facet.name,
        enabled: index !== 1,
      })),
    });
  });

  it("rejects an idle time that is not a whole number of seconds", () => {
    expect(() =>
      topicsSetupPayload({ ...draft, idleSeconds: "1.5" }, slots),
    ).toThrow(/whole number of seconds/);
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
});
