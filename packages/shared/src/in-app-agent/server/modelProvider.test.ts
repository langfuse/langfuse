import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "../../env";
import { logger } from "../../server/logger";
import { getInAppAgentModelConfig } from "./modelProvider";

const original = {
  LANGFUSE_AI_PROVIDER: env.LANGFUSE_AI_PROVIDER,
  LANGFUSE_AI_MODEL: env.LANGFUSE_AI_MODEL,
  LANGFUSE_AI_SMALL_MODEL: env.LANGFUSE_AI_SMALL_MODEL,
  LANGFUSE_AI_API_KEY: env.LANGFUSE_AI_API_KEY,
  LANGFUSE_AI_BASE_URL: env.LANGFUSE_AI_BASE_URL,
  LANGFUSE_AI_AWS_BEDROCK_REGION: env.LANGFUSE_AI_AWS_BEDROCK_REGION,
  LANGFUSE_AWS_BEDROCK_MODEL: env.LANGFUSE_AWS_BEDROCK_MODEL,
  LANGFUSE_AWS_BEDROCK_SMALL_MODEL: env.LANGFUSE_AWS_BEDROCK_SMALL_MODEL,
  LANGFUSE_AWS_BEDROCK_REGION: env.LANGFUSE_AWS_BEDROCK_REGION,
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
};

afterEach(() => {
  Object.assign(env, original);
});

describe("getInAppAgentModelConfig", () => {
  it("resolves Bedrock from the deprecated LANGFUSE_AWS_BEDROCK_* aliases alone", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: undefined,
      LANGFUSE_AI_MODEL: undefined,
      LANGFUSE_AI_SMALL_MODEL: undefined,
      LANGFUSE_AI_API_KEY: undefined,
      LANGFUSE_AI_BASE_URL: undefined,
      LANGFUSE_AI_AWS_BEDROCK_REGION: undefined,
      LANGFUSE_AWS_BEDROCK_MODEL: "eu.anthropic.claude-opus-4-8",
      LANGFUSE_AWS_BEDROCK_SMALL_MODEL: "eu.anthropic.claude-haiku-4-5",
      LANGFUSE_AWS_BEDROCK_REGION: "eu-west-1",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    });

    expect(getInAppAgentModelConfig()).toEqual({
      provider: "bedrock",
      modelId: "eu.anthropic.claude-opus-4-8",
      titleModelId: "eu.anthropic.claude-haiku-4-5",
      region: "eu-west-1",
    });
  });

  it("prefers LANGFUSE_AI_MODEL and LANGFUSE_AI_SMALL_MODEL on Bedrock", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: "bedrock",
      LANGFUSE_AI_MODEL: "eu.anthropic.claude-opus-5",
      LANGFUSE_AI_SMALL_MODEL: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
      LANGFUSE_AI_API_KEY: undefined,
      LANGFUSE_AI_BASE_URL: undefined,
      LANGFUSE_AI_AWS_BEDROCK_REGION: "eu-west-1",
      LANGFUSE_AWS_BEDROCK_MODEL: "eu.anthropic.claude-opus-4-8",
      LANGFUSE_AWS_BEDROCK_SMALL_MODEL: "eu.anthropic.claude-haiku-4-5",
      LANGFUSE_AWS_BEDROCK_REGION: "us-east-1",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    });

    expect(getInAppAgentModelConfig()).toEqual({
      provider: "bedrock",
      modelId: "eu.anthropic.claude-opus-5",
      titleModelId: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
      region: "eu-west-1",
    });
  });

  it("resolves Anthropic Messages from LANGFUSE_AI_PROVIDER and namespaced key/url", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: "anthropic",
      LANGFUSE_AI_MODEL: "claude-opus-4-8",
      LANGFUSE_AI_SMALL_MODEL: "claude-haiku-4-5",
      LANGFUSE_AI_API_KEY: "sk-ant-test",
      LANGFUSE_AI_BASE_URL: "https://api.anthropic.com",
      LANGFUSE_AWS_BEDROCK_MODEL: "eu.anthropic.claude-opus-4-8",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    });

    expect(getInAppAgentModelConfig()).toEqual({
      provider: "anthropic",
      modelId: "claude-opus-4-8",
      titleModelId: "claude-haiku-4-5",
      apiKey: "sk-ant-test",
      baseURL: "https://api.anthropic.com/v1",
    });
  });

  it("treats incomplete Anthropic env as unconfigured", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: "anthropic",
      LANGFUSE_AI_MODEL: "claude-opus-4-8",
      LANGFUSE_AI_API_KEY: undefined,
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    });

    expect(getInAppAgentModelConfig()).toBeUndefined();
  });

  it("honors LANGFUSE_AI_PROVIDER=anthropic even when Cloud region is set", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: "anthropic",
      LANGFUSE_AI_MODEL: "claude-opus-4-8",
      LANGFUSE_AI_SMALL_MODEL: "claude-haiku-4-5",
      LANGFUSE_AI_API_KEY: "sk-ant-test",
      LANGFUSE_AI_BASE_URL: "https://api.anthropic.com",
      LANGFUSE_AWS_BEDROCK_MODEL: "eu.anthropic.claude-opus-4-8",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
    });

    expect(getInAppAgentModelConfig()).toEqual({
      provider: "anthropic",
      modelId: "claude-opus-4-8",
      titleModelId: "claude-haiku-4-5",
      apiKey: "sk-ant-test",
      baseURL: "https://api.anthropic.com/v1",
    });
  });

  it("warns that Anthropic key and base URL are ignored on Bedrock", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: "bedrock",
      LANGFUSE_AI_MODEL: undefined,
      LANGFUSE_AI_SMALL_MODEL: undefined,
      LANGFUSE_AI_API_KEY: "sk-ant-test",
      LANGFUSE_AI_BASE_URL: "https://api.anthropic.com",
      LANGFUSE_AWS_BEDROCK_MODEL: "eu.anthropic.claude-opus-4-8",
      LANGFUSE_AWS_BEDROCK_SMALL_MODEL: undefined,
      LANGFUSE_AWS_BEDROCK_REGION: "eu-west-1",
      LANGFUSE_AI_AWS_BEDROCK_REGION: undefined,
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
    });

    expect(getInAppAgentModelConfig()).toEqual({
      provider: "bedrock",
      modelId: "eu.anthropic.claude-opus-4-8",
      titleModelId: "eu.anthropic.claude-opus-4-8",
      region: "eu-west-1",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toEqual(
      "Ignoring LANGFUSE_AI_API_KEY and LANGFUSE_AI_BASE_URL because the Langfuse AI provider is bedrock. Bedrock uses the instance AWS credential chain, not an Anthropic API key or base URL.",
    );

    warn.mockRestore();
  });

  it("prefers LANGFUSE_AI_AWS_BEDROCK_REGION over LANGFUSE_AWS_BEDROCK_REGION", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: undefined,
      LANGFUSE_AI_MODEL: undefined,
      LANGFUSE_AI_SMALL_MODEL: undefined,
      LANGFUSE_AI_API_KEY: undefined,
      LANGFUSE_AI_BASE_URL: undefined,
      LANGFUSE_AI_AWS_BEDROCK_REGION: "us-east-1",
      LANGFUSE_AWS_BEDROCK_MODEL: "eu.anthropic.claude-opus-4-8",
      LANGFUSE_AWS_BEDROCK_SMALL_MODEL: undefined,
      LANGFUSE_AWS_BEDROCK_REGION: "eu-west-1",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
    });

    expect(getInAppAgentModelConfig()).toEqual({
      provider: "bedrock",
      modelId: "eu.anthropic.claude-opus-4-8",
      titleModelId: "eu.anthropic.claude-opus-4-8",
      region: "us-east-1",
    });
  });
});
