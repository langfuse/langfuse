import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../../../../env";
import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "../../../../interfaces/customLLMProviderConfigSchemas";

const fromNodeProviderChain = vi.hoisted(() => vi.fn(() => vi.fn()));

vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain,
}));

import { OutboundUrlValidationError } from "../../../outbound-url";
import {
  assertValidBedrockRegion,
  buildBedrockEmbeddingModel,
  buildBedrockModel,
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

describe("Bedrock profile selection", () => {
  const originalEnv = {
    AWS_PROFILE: env.AWS_PROFILE,
    LANGFUSE_AI_FEATURES_AWS_PROFILE: env.LANGFUSE_AI_FEATURES_AWS_PROFILE,
    LANGFUSE_IN_APP_AGENT_AWS_PROFILE: env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE,
    LANGFUSE_AI_AWS_BEDROCK_REGION: env.LANGFUSE_AI_AWS_BEDROCK_REGION,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  };

  beforeEach(() => {
    fromNodeProviderChain.mockClear();
    env.AWS_PROFILE = undefined;
    env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE = "legacy";
    env.LANGFUSE_AI_AWS_BEDROCK_REGION = "eu-west-1";
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
  });

  afterEach(() => {
    Object.assign(env, originalEnv);
  });

  it.each([
    ["ai", "langfuse", "ai"],
    [undefined, "langfuse", "legacy"],
    ["ai", "user", undefined],
  ] as const)(
    "AI profile %s with %s credentials selects %s",
    (profile, credentialSource, expected) => {
      env.LANGFUSE_AI_FEATURES_AWS_PROFILE = profile;
      buildBedrockModel({
        modelId: "test-model",
        apiKey: BEDROCK_USE_DEFAULT_CREDENTIALS,
        config: { region: "eu-west-1" },
        credentialSource,
      });
      expect(fromNodeProviderChain).toHaveBeenCalledWith(
        expected ? { profile: expected } : {},
      );
    },
  );
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

function readProcessEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" ? value : undefined;
}

function writeProcessEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("Bedrock LLM host allowlist", () => {
  const originalAllowedHosts = env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS;
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalAiRegion = env.LANGFUSE_AI_AWS_BEDROCK_REGION;
  const runtimeEndpointEnv = "AWS_ENDPOINT_URL_BEDROCK_RUNTIME";
  const awsEndpointEnv = "AWS_ENDPOINT_URL";
  const awsRegionEnv = "AWS_REGION";
  const originalRuntimeEndpoint = readProcessEnv(runtimeEndpointEnv);
  const originalAwsEndpoint = readProcessEnv(awsEndpointEnv);
  const originalAwsRegion = readProcessEnv(awsRegionEnv);

  const userConnection = {
    modelId: "test-model",
    apiKey: JSON.stringify({ apiKey: "bedrock-key" }),
    config: { region: "eu-west-1" },
    credentialSource: "user" as const,
  };

  beforeEach(() => {
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    env.LANGFUSE_AI_AWS_BEDROCK_REGION = undefined;
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = [];
    writeProcessEnv(runtimeEndpointEnv, undefined);
    writeProcessEnv(awsEndpointEnv, undefined);
    writeProcessEnv(awsRegionEnv, undefined);
  });

  afterEach(() => {
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = originalAllowedHosts;
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    env.LANGFUSE_AI_AWS_BEDROCK_REGION = originalAiRegion;
    writeProcessEnv(runtimeEndpointEnv, originalRuntimeEndpoint);
    writeProcessEnv(awsEndpointEnv, originalAwsEndpoint);
    writeProcessEnv(awsRegionEnv, originalAwsRegion);
  });

  it("leaves Bedrock open when the allowlist is empty", () => {
    expect(() => buildBedrockModel(userConnection)).not.toThrow();
    expect(() => buildBedrockEmbeddingModel(userConnection)).not.toThrow();
  });

  it("accepts the region host for chat and embeddings when it is listed", () => {
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = [
      "bedrock-runtime.eu-west-1.amazonaws.com",
    ];

    expect(() => buildBedrockModel(userConnection)).not.toThrow();
    expect(() => buildBedrockEmbeddingModel(userConnection)).not.toThrow();
  });

  it("rejects chat and embeddings when the region host is not listed", () => {
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = ["litellm.corp"];

    expect(() => buildBedrockModel(userConnection)).toThrow(
      OutboundUrlValidationError,
    );
    expect(() => buildBedrockEmbeddingModel(userConnection)).toThrow(
      OutboundUrlValidationError,
    );
  });

  it("checks the China partition host", () => {
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = [
      "bedrock-runtime.cn-north-1.amazonaws.com.cn",
    ];

    expect(() =>
      buildBedrockModel({
        ...userConnection,
        config: { region: "cn-north-1" },
      }),
    ).not.toThrow();
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = [
      "bedrock-runtime.cn-north-1.amazonaws.com",
    ];
    expect(() =>
      buildBedrockModel({
        ...userConnection,
        config: { region: "cn-north-1" },
      }),
    ).toThrow(OutboundUrlValidationError);
  });

  it("checks the Bedrock endpoint override host ahead of the region host", () => {
    writeProcessEnv(runtimeEndpointEnv, "https://vpce.internal/bedrock");
    writeProcessEnv(awsEndpointEnv, "https://other.internal");
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = ["vpce.internal"];

    expect(() => buildBedrockModel(userConnection)).not.toThrow();

    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = [
      "bedrock-runtime.eu-west-1.amazonaws.com",
    ];
    expect(() => buildBedrockModel(userConnection)).toThrow(
      OutboundUrlValidationError,
    );
  });

  it("checks AWS_ENDPOINT_URL when the Bedrock-specific override is unset", () => {
    writeProcessEnv(awsEndpointEnv, "https://proxy.internal");
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = ["proxy.internal"];

    expect(() => buildBedrockModel(userConnection)).not.toThrow();
  });

  it("requires a region for Langfuse AI Bedrock when the allowlist is set", () => {
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = [
      "bedrock-runtime.eu-west-1.amazonaws.com",
    ];

    expect(() =>
      buildBedrockModel({
        modelId: "test-model",
        apiKey: BEDROCK_USE_DEFAULT_CREDENTIALS,
        credentialSource: "langfuse",
      }),
    ).toThrow(
      "Bedrock region is required when an LLM host allowlist is configured.",
    );
  });

  it("uses the Langfuse AI Bedrock region when the allowlist is set", () => {
    env.LANGFUSE_AI_AWS_BEDROCK_REGION = "eu-central-1";
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = [
      "bedrock-runtime.eu-central-1.amazonaws.com",
    ];

    expect(() =>
      buildBedrockModel({
        modelId: "test-model",
        apiKey: BEDROCK_USE_DEFAULT_CREDENTIALS,
        credentialSource: "langfuse",
      }),
    ).not.toThrow();
  });

  it("ignores the allowlist on Langfuse Cloud", () => {
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "US";
    env.LANGFUSE_LLM_CONNECTION_ALLOWED_HOSTS = ["litellm.corp"];

    expect(() => buildBedrockModel(userConnection)).not.toThrow();
  });
});
