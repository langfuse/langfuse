import { afterEach, describe, expect, it } from "vitest";

import { env as sharedEnv } from "@langfuse/shared/src/env";

import { getAiFeatureConfigTelemetry } from "@/src/features/telemetry/aiFeatures";

// Telemetry must not disagree with the product about whether this instance has
// a usable AI features setup, so the reported shape is derived from the same
// resolver the Assistant and Ask AI use rather than from the env vars directly.
describe("AI feature config telemetry", () => {
  const original = {
    LANGFUSE_AI_PROVIDER: sharedEnv.LANGFUSE_AI_PROVIDER,
    LANGFUSE_AI_MODEL: sharedEnv.LANGFUSE_AI_MODEL,
    LANGFUSE_AI_SMALL_MODEL: sharedEnv.LANGFUSE_AI_SMALL_MODEL,
    LANGFUSE_AI_API_KEY: sharedEnv.LANGFUSE_AI_API_KEY,
    LANGFUSE_AI_AWS_BEDROCK_REGION: sharedEnv.LANGFUSE_AI_AWS_BEDROCK_REGION,
    LANGFUSE_IN_APP_AGENT_ENABLED: sharedEnv.LANGFUSE_IN_APP_AGENT_ENABLED,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION:
      sharedEnv.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  };

  afterEach(() => {
    Object.assign(sharedEnv, original);
  });

  const selfHostedBase = {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    LANGFUSE_AI_API_KEY: undefined,
    LANGFUSE_AI_SMALL_MODEL: undefined,
    LANGFUSE_AI_AWS_BEDROCK_REGION: undefined,
  };

  it("reports the resolved provider when a model is configured", () => {
    Object.assign(sharedEnv, {
      ...selfHostedBase,
      LANGFUSE_IN_APP_AGENT_ENABLED: "true",
      // Unset provider resolves to Bedrock, so telemetry must not report null.
      LANGFUSE_AI_PROVIDER: undefined,
      LANGFUSE_AI_MODEL: "eu.anthropic.claude-opus-5",
    });

    expect(getAiFeatureConfigTelemetry()).toEqual({
      assistantInstanceEnabled: true,
      langfuseAiModelConfigured: true,
      langfuseAiProvider: "bedrock",
    });
  });

  it("reports an incomplete provider config as unconfigured", () => {
    Object.assign(sharedEnv, {
      ...selfHostedBase,
      LANGFUSE_IN_APP_AGENT_ENABLED: "true",
      // Anthropic without an API key is unusable, so the instance switch being
      // on must not be reported as a working setup.
      LANGFUSE_AI_PROVIDER: "anthropic",
      LANGFUSE_AI_MODEL: "claude-opus-5",
    });

    expect(getAiFeatureConfigTelemetry()).toEqual({
      assistantInstanceEnabled: true,
      langfuseAiModelConfigured: false,
      langfuseAiProvider: null,
    });
  });

  it("reports the instance switch as off when unset on self-hosted", () => {
    Object.assign(sharedEnv, {
      ...selfHostedBase,
      LANGFUSE_IN_APP_AGENT_ENABLED: undefined,
      LANGFUSE_AI_PROVIDER: undefined,
      LANGFUSE_AI_MODEL: "eu.anthropic.claude-opus-5",
    });

    expect(getAiFeatureConfigTelemetry()).toMatchObject({
      assistantInstanceEnabled: false,
      langfuseAiModelConfigured: true,
    });
  });
});
