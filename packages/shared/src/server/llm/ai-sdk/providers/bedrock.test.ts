import { describe, expect, it } from "vitest";

import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "../../../../interfaces/customLLMProviderConfigSchemas";
import {
  resolveBedrockProviderAuth,
  translateBedrockProviderOptions,
} from "./bedrock";

describe("translateBedrockProviderOptions", () => {
  it("returns undefined for empty input", () => {
    expect(translateBedrockProviderOptions(undefined)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(translateBedrockProviderOptions({})).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("wraps options verbatim as additionalModelRequestFields", () => {
    expect(
      translateBedrockProviderOptions({
        thinking: { type: "enabled", budget_tokens: 1024 },
        top_k: 10,
      }),
    ).toEqual({
      ok: true,
      value: {
        additionalModelRequestFields: {
          thinking: { type: "enabled", budget_tokens: 1024 },
          top_k: 10,
        },
      },
    });
  });

  it("merges a nested bedrock object as AI SDK-shaped options", () => {
    expect(
      translateBedrockProviderOptions({
        bedrock: {
          reasoningConfig: { type: "enabled", budgetTokens: 1024 },
        },
        anthropic_beta: ["computer-use-2024-10-22"],
      }),
    ).toEqual({
      ok: true,
      value: {
        additionalModelRequestFields: {
          anthropic_beta: ["computer-use-2024-10-22"],
        },
        reasoningConfig: { type: "enabled", budgetTokens: 1024 },
      },
    });
  });
});

describe("resolveBedrockProviderAuth", () => {
  it("uses the default credential chain for the sentinel when allowed", () => {
    const auth = resolveBedrockProviderAuth({
      secretKey: BEDROCK_USE_DEFAULT_CREDENTIALS,
      allowDefaultCredentials: true,
    });
    expect(auth.credentialProvider).toBeTypeOf("function");
    expect(auth.accessKeyId).toBeUndefined();
    expect(auth.apiKey).toBeUndefined();
  });

  it("rejects the sentinel when default credentials are not allowed", () => {
    expect(() =>
      resolveBedrockProviderAuth({
        secretKey: BEDROCK_USE_DEFAULT_CREDENTIALS,
        allowDefaultCredentials: false,
      }),
    ).toThrow("Invalid Bedrock credentials");
  });

  it("maps access key JSON to explicit credentials", () => {
    expect(
      resolveBedrockProviderAuth({
        secretKey: JSON.stringify({
          accessKeyId: "AKIA123",
          secretAccessKey: "secret",
        }),
        allowDefaultCredentials: false,
      }),
    ).toEqual({ accessKeyId: "AKIA123", secretAccessKey: "secret" });
  });

  it("maps a Bedrock API key to bearer auth", () => {
    expect(
      resolveBedrockProviderAuth({
        secretKey: JSON.stringify({ apiKey: "bedrock-key" }),
        allowDefaultCredentials: false,
      }),
    ).toEqual({ apiKey: "bedrock-key" });
  });

  it("rejects malformed credentials", () => {
    expect(() =>
      resolveBedrockProviderAuth({
        secretKey: "not-json",
        allowDefaultCredentials: false,
      }),
    ).toThrow("Invalid Bedrock credentials");
  });
});
