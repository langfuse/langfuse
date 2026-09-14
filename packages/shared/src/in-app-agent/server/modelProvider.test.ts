import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "../../env";
import { logger } from "../../server/logger";
import {
  getInAppAgentModelConfig,
  isInAppAgentInstanceEnabled,
} from "./modelProvider";

const original = {
  LANGFUSE_AI_PROVIDER: env.LANGFUSE_AI_PROVIDER,
  LANGFUSE_AI_MODEL: env.LANGFUSE_AI_MODEL,
  LANGFUSE_AI_SMALL_MODEL: env.LANGFUSE_AI_SMALL_MODEL,
  LANGFUSE_AI_API_KEY: env.LANGFUSE_AI_API_KEY,
  LANGFUSE_AI_BASE_URL: env.LANGFUSE_AI_BASE_URL,
  LANGFUSE_AI_USE_RESPONSES_API: env.LANGFUSE_AI_USE_RESPONSES_API,
  LANGFUSE_AI_EXTRA_HEADERS: env.LANGFUSE_AI_EXTRA_HEADERS,
  LANGFUSE_AI_AWS_BEDROCK_REGION: env.LANGFUSE_AI_AWS_BEDROCK_REGION,
  LANGFUSE_IN_APP_AGENT_ENABLED: env.LANGFUSE_IN_APP_AGENT_ENABLED,
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
};

afterEach(() => {
  Object.assign(env, original);
});

describe("getInAppAgentModelConfig", () => {
  it("resolves Bedrock from LANGFUSE_AI_MODEL and LANGFUSE_AI_SMALL_MODEL", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: "bedrock",
      LANGFUSE_AI_MODEL: "eu.anthropic.claude-opus-5",
      LANGFUSE_AI_SMALL_MODEL: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
      LANGFUSE_AI_API_KEY: undefined,
      LANGFUSE_AI_BASE_URL: undefined,
      LANGFUSE_AI_EXTRA_HEADERS: undefined,
      LANGFUSE_AI_AWS_BEDROCK_REGION: "eu-west-1",
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
      LANGFUSE_AI_EXTRA_HEADERS: '{"X-LLM-Exec-Token":"proxy-token"}',
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    });

    expect(getInAppAgentModelConfig()).toEqual({
      provider: "anthropic",
      modelId: "claude-opus-4-8",
      titleModelId: "claude-haiku-4-5",
      apiKey: "sk-ant-test",
      baseURL: "https://api.anthropic.com/v1",
      extraHeaders: { "X-LLM-Exec-Token": "proxy-token" },
    });
  });

  it("resolves OpenAI-compatible Chat Completions from LANGFUSE_AI_PROVIDER", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: "openai",
      LANGFUSE_AI_MODEL: "gpt-5.6-sol",
      LANGFUSE_AI_SMALL_MODEL: "gpt-5.6-luna",
      LANGFUSE_AI_API_KEY: "sk-test",
      LANGFUSE_AI_BASE_URL: "https://llm-exec.internal/v1",
      LANGFUSE_AI_EXTRA_HEADERS: '{"X-LLM-Exec-Token":"proxy-token"}',
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    });

    expect(getInAppAgentModelConfig()).toEqual({
      provider: "openai",
      modelId: "gpt-5.6-sol",
      titleModelId: "gpt-5.6-luna",
      apiKey: "sk-test",
      baseURL: "https://llm-exec.internal/v1",
      extraHeaders: { "X-LLM-Exec-Token": "proxy-token" },
    });
  });

  it("treats incomplete OpenAI env as unconfigured", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: "openai",
      LANGFUSE_AI_MODEL: "gpt-5.6-sol",
      LANGFUSE_AI_API_KEY: undefined,
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    });

    expect(getInAppAgentModelConfig()).toBeUndefined();
  });

  it("treats whitespace-only extra headers as unset", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: "openai",
      LANGFUSE_AI_MODEL: "gpt-5.6-sol",
      LANGFUSE_AI_SMALL_MODEL: "gpt-5.6-luna",
      LANGFUSE_AI_API_KEY: "sk-test",
      LANGFUSE_AI_BASE_URL: "https://llm-exec.internal/v1",
      LANGFUSE_AI_EXTRA_HEADERS: "  ",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    });

    expect(getInAppAgentModelConfig()).toEqual({
      provider: "openai",
      modelId: "gpt-5.6-sol",
      titleModelId: "gpt-5.6-luna",
      apiKey: "sk-test",
      baseURL: "https://llm-exec.internal/v1",
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
      LANGFUSE_AI_EXTRA_HEADERS: undefined,
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

  it("warns that API key, base URL, and extra headers are ignored on Bedrock", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: "bedrock",
      LANGFUSE_AI_MODEL: "eu.anthropic.claude-opus-5",
      LANGFUSE_AI_SMALL_MODEL: undefined,
      LANGFUSE_AI_API_KEY: "sk-ant-test",
      LANGFUSE_AI_BASE_URL: "https://api.anthropic.com",
      LANGFUSE_AI_EXTRA_HEADERS: '{"X-LLM-Exec-Token":"proxy-token"}',
      LANGFUSE_AI_AWS_BEDROCK_REGION: "eu-west-1",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
    });

    expect(getInAppAgentModelConfig()).toEqual({
      provider: "bedrock",
      modelId: "eu.anthropic.claude-opus-5",
      titleModelId: "eu.anthropic.claude-opus-5",
      region: "eu-west-1",
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toEqual(
      "Ignoring LANGFUSE_AI_API_KEY and LANGFUSE_AI_BASE_URL and LANGFUSE_AI_EXTRA_HEADERS because the Langfuse AI provider is bedrock. Bedrock uses the instance AWS credential chain, not an API key, base URL, extra headers, or the OpenAI Responses API toggle.",
    );

    warn.mockRestore();
  });

  it("treats an invalid LANGFUSE_AI_AWS_BEDROCK_REGION as unconfigured", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: "bedrock",
      LANGFUSE_AI_MODEL: "eu.anthropic.claude-opus-5",
      LANGFUSE_AI_SMALL_MODEL: undefined,
      LANGFUSE_AI_API_KEY: undefined,
      LANGFUSE_AI_BASE_URL: undefined,
      LANGFUSE_AI_EXTRA_HEADERS: undefined,
      LANGFUSE_AI_AWS_BEDROCK_REGION: "us-east-1.attacker.test",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
    });

    expect(getInAppAgentModelConfig()).toBeUndefined();
  });

  it("treats an unset LANGFUSE_AI_PROVIDER as unconfigured even when model vars are set", () => {
    Object.assign(env, {
      LANGFUSE_AI_PROVIDER: undefined,
      LANGFUSE_AI_MODEL: "eu.anthropic.claude-opus-5",
      LANGFUSE_AI_SMALL_MODEL: "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
      LANGFUSE_AI_API_KEY: undefined,
      LANGFUSE_AI_BASE_URL: undefined,
      LANGFUSE_AI_EXTRA_HEADERS: undefined,
      LANGFUSE_AI_AWS_BEDROCK_REGION: "eu-west-1",
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "EU",
    });

    expect(getInAppAgentModelConfig()).toBeUndefined();
  });
});

describe("isInAppAgentInstanceEnabled", () => {
  it("enables the self-hosted worker when LANGFUSE_IN_APP_AGENT_ENABLED is true", () => {
    Object.assign(env, {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      LANGFUSE_IN_APP_AGENT_ENABLED: "true",
    });

    expect(isInAppAgentInstanceEnabled()).toBe(true);
  });

  it("disables the self-hosted worker when LANGFUSE_IN_APP_AGENT_ENABLED is unset", () => {
    Object.assign(env, {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      LANGFUSE_IN_APP_AGENT_ENABLED: undefined,
    });

    expect(isInAppAgentInstanceEnabled()).toBe(false);
  });
});
