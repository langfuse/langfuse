import { afterEach, describe, expect, it } from "vitest";

import { env } from "../../env";
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
  it("resolves Bedrock from existing env when provider is unset", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: undefined,
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

  it("keeps Cloud on Bedrock even when Anthropic provider env is set", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: "anthropic",
      LANGFUSE_AI_MODEL: "claude-opus-4-8",
      LANGFUSE_AI_API_KEY: "sk-ant-test",
      LANGFUSE_AWS_BEDROCK_MODEL: "eu.anthropic.claude-opus-4-8",
      LANGFUSE_AWS_BEDROCK_SMALL_MODEL: undefined,
      LANGFUSE_AWS_BEDROCK_REGION: undefined,
      LANGFUSE_AI_AWS_BEDROCK_REGION: undefined,
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
    });

    expect(getInAppAgentModelConfig()).toEqual({
      provider: "bedrock",
      modelId: "eu.anthropic.claude-opus-4-8",
      titleModelId: "eu.anthropic.claude-opus-4-8",
      region: undefined,
    });
  });

  it("prefers LANGFUSE_AI_AWS_BEDROCK_REGION over LANGFUSE_AWS_BEDROCK_REGION", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: undefined,
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
