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
};

describe("topicsSetupPayload", () => {
  it("saves models and idle time, and nothing rule-related", () => {
    const payload = topicsSetupPayload(draft, slots);
    expect(payload).toMatchObject({
      embeddingDimensions: 1024,
      traceIdleMs: 120_000,
    });
    expect(payload.ruleId).toBeUndefined();
    expect(payload.facets).toBeUndefined();
    expect(payload.filter).toBeUndefined();
  });

  it("saves without models", () => {
    expect(
      topicsSetupPayload(draft, {
        ...slots,
        summary: null,
        embedding: null,
        clustering: null,
      }),
    ).toMatchObject({ summary: null, embedding: null, clustering: null });
  });

  it("rejects embedding dimensions above 2,048", () => {
    expect(() =>
      topicsSetupPayload(draft, { ...slots, embeddingDimensions: 2049 }),
    ).toThrow("Use at most 2,048 embedding dimensions.");
    expect(
      topicsSetupPayload(draft, { ...slots, embeddingDimensions: 2048 }),
    ).toMatchObject({ embeddingDimensions: 2048 });
  });

  it("rejects an idle time below 60 seconds", () => {
    expect(() =>
      topicsSetupPayload({ ...draft, idleSeconds: "59" }, slots),
    ).toThrow();
  });
});
