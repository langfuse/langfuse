import { describe, expect, it } from "vitest";

import {
  toGoogleAIStudioBaseURL,
  translateGoogleProviderOptions,
} from "./google";

describe("toGoogleAIStudioBaseURL", () => {
  it("returns undefined for missing baseURL", () => {
    expect(toGoogleAIStudioBaseURL(undefined)).toBeUndefined();
    expect(toGoogleAIStudioBaseURL(null)).toBeUndefined();
  });

  it("appends /v1beta to an origin-style stored URL", () => {
    expect(toGoogleAIStudioBaseURL("https://proxy.example.com/google")).toBe(
      "https://proxy.example.com/google/v1beta",
    );
    expect(toGoogleAIStudioBaseURL("https://proxy.example.com/google/")).toBe(
      "https://proxy.example.com/google/v1beta",
    );
  });

  it("keeps an existing /v1beta suffix", () => {
    expect(
      toGoogleAIStudioBaseURL(
        "https://generativelanguage.googleapis.com/v1beta",
      ),
    ).toBe("https://generativelanguage.googleapis.com/v1beta");
  });
});

describe("translateGoogleProviderOptions", () => {
  it("returns undefined without thinking options", () => {
    expect(
      translateGoogleProviderOptions({
        providerOptions: undefined,
        model: "gemini-2.5-flash",
      }),
    ).toEqual({ ok: true, value: undefined });
  });

  it("silently strips unknown keys from the non-strict persisted shape", () => {
    expect(
      translateGoogleProviderOptions({
        providerOptions: { customField: 1, thinkingBudget: 1024 },
        model: "gemini-2.5-flash",
      }),
    ).toEqual({
      ok: true,
      value: {
        thinkingConfig: { thinkingBudget: 1024, includeThoughts: true },
      },
    });
  });

  it("maps thinkingBudget for the gemini-2.5 budget family", () => {
    expect(
      translateGoogleProviderOptions({
        providerOptions: { thinkingBudget: 0 },
        model: "gemini-2.5-flash",
      }),
    ).toEqual({
      ok: true,
      value: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
    });
  });

  it("clamps gemini-2.5-pro budgets below the 128 minimum", () => {
    expect(
      translateGoogleProviderOptions({
        providerOptions: { thinkingBudget: 0 },
        model: "gemini-2.5-pro",
      }),
    ).toEqual({
      ok: true,
      value: {
        thinkingConfig: { thinkingBudget: 128, includeThoughts: false },
      },
    });
    expect(
      translateGoogleProviderOptions({
        providerOptions: { thinkingBudget: 100 },
        model: "gemini-2.5-pro",
      }),
    ).toEqual({
      ok: true,
      value: { thinkingConfig: { thinkingBudget: 128, includeThoughts: true } },
    });
  });

  it("prefers maxReasoningTokens over thinkingBudget", () => {
    expect(
      translateGoogleProviderOptions({
        providerOptions: { thinkingBudget: 1024 },
        model: "gemini-2.5-flash",
        maxReasoningTokens: 2048,
      }),
    ).toEqual({
      ok: true,
      value: {
        thinkingConfig: { thinkingBudget: 2048, includeThoughts: true },
      },
    });
  });

  it("maps thinkingLevel for level-family models", () => {
    expect(
      translateGoogleProviderOptions({
        providerOptions: { thinkingLevel: "HIGH" },
        model: "gemini-3-flash",
      }),
    ).toEqual({
      ok: true,
      value: {
        thinkingConfig: { thinkingLevel: "high", includeThoughts: true },
      },
    });
    expect(
      translateGoogleProviderOptions({
        providerOptions: { thinkingLevel: "minimal" },
        model: "gemini-3-flash",
      }),
    ).toEqual({
      ok: true,
      value: {
        thinkingConfig: { thinkingLevel: "minimal", includeThoughts: false },
      },
    });
  });

  it("remaps unsupported levels for gemini-3 pro families", () => {
    expect(
      translateGoogleProviderOptions({
        providerOptions: { thinkingLevel: "medium" },
        model: "gemini-3-pro",
      }),
    ).toEqual({
      ok: true,
      value: {
        thinkingConfig: { thinkingLevel: "high", includeThoughts: true },
      },
    });
    expect(
      translateGoogleProviderOptions({
        providerOptions: { thinkingLevel: "minimal" },
        model: "gemini-3.1-pro",
      }),
    ).toEqual({
      ok: true,
      value: {
        thinkingConfig: { thinkingLevel: "low", includeThoughts: false },
      },
    });
  });

  it("rejects representation conversions that require model tables", () => {
    // level-only on a budget-family model
    expect(
      translateGoogleProviderOptions({
        providerOptions: { thinkingLevel: "high" },
        model: "gemini-2.5-flash",
      }).ok,
    ).toBe(false);
    // budget-only on a level-family model
    expect(
      translateGoogleProviderOptions({
        providerOptions: { thinkingBudget: 1024 },
        model: "gemini-3-flash",
      }).ok,
    ).toBe(false);
  });

  it("rejects provider options with wrong types", () => {
    expect(
      translateGoogleProviderOptions({
        providerOptions: { thinkingBudget: "lots" },
        model: "gemini-2.5-flash",
      }).ok,
    ).toBe(false);
  });

  it("merges a nested google object verbatim", () => {
    expect(
      translateGoogleProviderOptions({
        providerOptions: {
          google: { safetySettings: [] },
          thinkingBudget: 512,
        },
        model: "gemini-2.5-flash",
      }),
    ).toEqual({
      ok: true,
      value: {
        safetySettings: [],
        thinkingConfig: { thinkingBudget: 512, includeThoughts: true },
      },
    });
  });
});
