import { beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../../../env";
import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "../../../../interfaces/customLLMProviderConfigSchemas";

const fromNodeProviderChain = vi.hoisted(() => vi.fn(() => vi.fn()));

vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain,
}));

import {
  assertValidBedrockRegion,
  createDefaultBedrockProviderAuth,
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

  it("keeps a non-object bedrock key in the verbatim passthrough", () => {
    expect(
      translateBedrockProviderOptions({ bedrock: ["us-east-1"], top_k: 10 }),
    ).toEqual({
      ok: true,
      value: {
        additionalModelRequestFields: { bedrock: ["us-east-1"], top_k: 10 },
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

describe("assertValidBedrockRegion", () => {
  it("accepts AWS region identifiers and undefined", () => {
    expect(() => assertValidBedrockRegion("us-east-1")).not.toThrow();
    expect(() => assertValidBedrockRegion("eu-central-1")).not.toThrow();
    expect(() => assertValidBedrockRegion(undefined)).not.toThrow();
  });

  it("rejects host-reshaping regions", () => {
    expect(() =>
      assertValidBedrockRegion("us-east-1.amazonaws.com@attacker.test/"),
    ).toThrow("Invalid Bedrock region");
    expect(() => assertValidBedrockRegion("us-east-1.attacker.test")).toThrow(
      "Invalid Bedrock region",
    );
  });
});

describe("createDefaultBedrockProviderAuth", () => {
  beforeEach(() => {
    fromNodeProviderChain.mockClear();
  });

  it("passes the local AWS profile when no profile argument is given", () => {
    const original = env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE;
    env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE = "playground";

    createDefaultBedrockProviderAuth();

    expect(fromNodeProviderChain).toHaveBeenCalledWith({
      profile: "playground",
    });
    env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE = original;
  });

  it("prefers an explicit profile over the environment", () => {
    const original = env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE;
    env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE = "playground";

    createDefaultBedrockProviderAuth({ profile: "other" });

    expect(fromNodeProviderChain).toHaveBeenCalledWith({ profile: "other" });
    env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE = original;
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
    // Empty string (not undefined) so the provider never falls back to the
    // server's AWS_BEARER_TOKEN_BEDROCK env var.
    expect(auth.apiKey).toBe("");
  });

  it("rejects the sentinel when default credentials are not allowed", () => {
    expect(() =>
      resolveBedrockProviderAuth({
        secretKey: BEDROCK_USE_DEFAULT_CREDENTIALS,
        allowDefaultCredentials: false,
      }),
    ).toThrow("Invalid Bedrock credentials");
  });

  it("maps access key JSON to explicit credentials, suppressing the bearer env fallback", () => {
    expect(
      resolveBedrockProviderAuth({
        secretKey: JSON.stringify({
          accessKeyId: "AKIA123",
          secretAccessKey: "secret",
        }),
        allowDefaultCredentials: false,
      }),
    ).toEqual({
      accessKeyId: "AKIA123",
      secretAccessKey: "secret",
      apiKey: "",
    });
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
