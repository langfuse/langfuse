import { describe, expect, it } from "vitest";
import type { ConfigureTopicsSaveDraft } from "./ConfigureTopicsDialog";
import {
  getOpenRouterProviders,
  hasSelectedOpenRouterProvider,
  isOpenRouterBaseURL,
  topicsSetupPayload,
} from "./topics-setup";

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

  it("rejects an idle time below 60 seconds", () => {
    expect(() =>
      topicsSetupPayload({ ...draft, idleSeconds: "59" }, slots),
    ).toThrow();
  });
});

describe("OpenRouter connection detection", () => {
  it("matches OpenRouter endpoints and rejects lookalike hosts", () => {
    expect(isOpenRouterBaseURL("https://openrouter.ai/api/v1")).toBe(true);
    expect(isOpenRouterBaseURL("https://eu.openrouter.ai/api/v1")).toBe(true);
    expect(isOpenRouterBaseURL("https://openrouter.ai./api/v1")).toBe(true);
    expect(isOpenRouterBaseURL("https://openrouter.ai.example.com/v1")).toBe(
      false,
    );
    expect(isOpenRouterBaseURL("https://api.openai.com/v1")).toBe(false);
    expect(isOpenRouterBaseURL(null)).toBe(false);
  });

  it("detects when any selected Topics slot uses an OpenRouter connection", () => {
    const openRouterProviders = getOpenRouterProviders([
      { provider: "openai", baseURL: null },
      { provider: "custom-or", baseURL: "https://openrouter.ai/api/v1" },
    ]);
    expect(openRouterProviders).toEqual(["custom-or"]);
    expect(
      hasSelectedOpenRouterProvider(
        [{ provider: "openai" }, { provider: "custom-or" }, null],
        openRouterProviders,
      ),
    ).toBe(true);
    expect(
      hasSelectedOpenRouterProvider(
        [{ provider: "openai" }, null, null],
        openRouterProviders,
      ),
    ).toBe(false);
  });
});
