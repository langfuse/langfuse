import { describe, expect, it } from "vitest";

import {
  toAnthropicBaseURL,
  translateAnthropicProviderOptions,
} from "./anthropic";

describe("toAnthropicBaseURL", () => {
  it("returns undefined for missing baseURL", () => {
    expect(toAnthropicBaseURL(undefined)).toBeUndefined();
    expect(toAnthropicBaseURL(null)).toBeUndefined();
    expect(toAnthropicBaseURL("")).toBeUndefined();
  });

  it("appends /v1 to an origin-style stored URL", () => {
    expect(toAnthropicBaseURL("https://api.anthropic.com")).toBe(
      "https://api.anthropic.com/v1",
    );
    expect(toAnthropicBaseURL("https://proxy.example.com/anthropic/")).toBe(
      "https://proxy.example.com/anthropic/v1",
    );
  });

  it("keeps an existing /v1 suffix", () => {
    expect(toAnthropicBaseURL("https://api.anthropic.com/v1")).toBe(
      "https://api.anthropic.com/v1",
    );
    expect(toAnthropicBaseURL("https://api.anthropic.com/v1/")).toBe(
      "https://api.anthropic.com/v1",
    );
  });
});

describe("translateAnthropicProviderOptions", () => {
  it("returns undefined for empty input", () => {
    expect(translateAnthropicProviderOptions(undefined)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(translateAnthropicProviderOptions({})).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("translates snake_case thinking config to AI SDK camelCase", () => {
    expect(
      translateAnthropicProviderOptions({
        thinking: { type: "enabled", budget_tokens: 2048 },
      }),
    ).toEqual({
      ok: true,
      value: { thinking: { type: "enabled", budgetTokens: 2048 } },
    });
  });

  it("passes through camelCase thinking and adaptive display", () => {
    expect(
      translateAnthropicProviderOptions({
        thinking: { type: "adaptive", display: "summarized" },
      }),
    ).toEqual({
      ok: true,
      value: { thinking: { type: "adaptive", display: "summarized" } },
    });
    expect(
      translateAnthropicProviderOptions({
        thinking: { type: "enabled", budgetTokens: 1024 },
      }),
    ).toEqual({
      ok: true,
      value: { thinking: { type: "enabled", budgetTokens: 1024 } },
    });
  });

  it("rejects thinking configs with unknown shape", () => {
    expect(
      translateAnthropicProviderOptions({
        thinking: { type: "enabled", budget_tokens: 1024, custom: true },
      }),
    ).toEqual({ ok: false, unknownKeys: ["thinking"] });
    expect(translateAnthropicProviderOptions({ thinking: "enabled" })).toEqual({
      ok: false,
      unknownKeys: ["thinking"],
    });
  });

  it("translates metadata.user_id", () => {
    expect(
      translateAnthropicProviderOptions({ metadata: { user_id: "user-1" } }),
    ).toEqual({ ok: true, value: { metadata: { userId: "user-1" } } });
  });

  it("rejects metadata with unknown fields", () => {
    expect(
      translateAnthropicProviderOptions({ metadata: { foo: "bar" } }),
    ).toEqual({ ok: false, unknownKeys: ["metadata"] });
  });

  it("passes through AI SDK-shaped keys", () => {
    expect(
      translateAnthropicProviderOptions({
        sendReasoning: true,
        disableParallelToolUse: true,
        structuredOutputMode: "jsonTool",
      }),
    ).toEqual({
      ok: true,
      value: {
        sendReasoning: true,
        disableParallelToolUse: true,
        structuredOutputMode: "jsonTool",
      },
    });
  });

  it("merges a nested anthropic object verbatim", () => {
    expect(
      translateAnthropicProviderOptions({
        anthropic: { thinking: { type: "enabled", budgetTokens: 512 } },
      }),
    ).toEqual({
      ok: true,
      value: { thinking: { type: "enabled", budgetTokens: 512 } },
    });
  });

  it("rejects unknown keys instead of silently dropping them", () => {
    expect(
      translateAnthropicProviderOptions({
        thinking: { type: "enabled" },
        top_k: 5,
        output_config: { effort: "high" },
      }),
    ).toEqual({ ok: false, unknownKeys: ["top_k", "output_config"] });
  });

  it("drops a model override only for the Vertex-Claude path", () => {
    expect(
      translateAnthropicProviderOptions(
        { model: "claude-override" },
        { dropModelOverride: true },
      ),
    ).toEqual({ ok: true, value: undefined });
    expect(
      translateAnthropicProviderOptions({ model: "claude-override" }),
    ).toEqual({ ok: false, unknownKeys: ["model"] });
  });
});
