import { describe, expect, it } from "vitest";

import {
  ORCAROUTER_DEFAULT_BASE_URL,
  isOrcaRouterEndpoint,
  translateOrcaRouterProviderOptions,
} from "./orcarouter";

describe("isOrcaRouterEndpoint", () => {
  it("recognizes the OrcaRouter default endpoint", () => {
    expect(isOrcaRouterEndpoint(undefined)).toBe(false);
    expect(isOrcaRouterEndpoint(null)).toBe(false);
    expect(isOrcaRouterEndpoint("https://api.orcarouter.ai/v1")).toBe(true);
    expect(isOrcaRouterEndpoint("https://api.orcarouter.ai./v1")).toBe(true);
  });

  it("rejects non-OrcaRouter endpoints", () => {
    expect(isOrcaRouterEndpoint("https://api.openai.com/v1")).toBe(false);
    expect(isOrcaRouterEndpoint("https://orcarouter.example.com/v1")).toBe(
      false,
    );
    expect(isOrcaRouterEndpoint("localhost:8080")).toBe(false);
  });

  it("exposes the documented default base URL", () => {
    expect(ORCAROUTER_DEFAULT_BASE_URL).toBe("https://api.orcarouter.ai/v1");
  });
});

describe("translateOrcaRouterProviderOptions", () => {
  it("returns undefined for empty input", () => {
    expect(translateOrcaRouterProviderOptions(undefined)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(translateOrcaRouterProviderOptions({})).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("translates snake_case body params to wire shape", () => {
    expect(
      translateOrcaRouterProviderOptions({
        parallel_tool_calls: false,
        max_completion_tokens: 128,
      }),
    ).toEqual({
      ok: true,
      value: {
        parallel_tool_calls: false,
        max_completion_tokens: 128,
      },
    });
  });

  it("passes through unknown gateway-specific options", () => {
    expect(
      translateOrcaRouterProviderOptions({
        reasoning_effort: "high",
        custom_gateway_option: "x",
      }),
    ).toEqual({
      ok: true,
      value: { reasoningEffort: "high", custom_gateway_option: "x" },
    });
  });

  it("passes through unknown top-level gateway options", () => {
    expect(
      translateOrcaRouterProviderOptions({ custom_gateway_option: 1 }),
    ).toEqual({
      ok: true,
      value: { custom_gateway_option: 1 },
    });
  });

  it("merges a nested openai object verbatim", () => {
    expect(
      translateOrcaRouterProviderOptions({
        openai: { reasoningEffort: "medium", store: false },
      }),
    ).toEqual({
      ok: true,
      value: { reasoningEffort: "medium", store: false },
    });
  });
});
