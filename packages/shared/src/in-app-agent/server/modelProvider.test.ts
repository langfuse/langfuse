import { afterEach, describe, expect, it } from "vitest";

import { env } from "../../env";
import { BEDROCK_USE_DEFAULT_CREDENTIALS } from "../../interfaces/customLLMProviderConfigSchemas";
import { decrypt } from "../../encryption";
import {
  getInAppAgentModelConfig,
  getInAppAgentModelConnectionSecret,
} from "./modelProvider";

const originalEnvironment = {
  model: env.LANGFUSE_AWS_BEDROCK_MODEL,
  smallModel: env.LANGFUSE_AWS_BEDROCK_SMALL_MODEL,
  region: env.LANGFUSE_AWS_BEDROCK_REGION,
  apiKey: env.LANGFUSE_IN_APP_AGENT_BEDROCK_API_KEY,
};

afterEach(() => {
  (env as any).LANGFUSE_AWS_BEDROCK_MODEL = originalEnvironment.model;
  (env as any).LANGFUSE_AWS_BEDROCK_SMALL_MODEL =
    originalEnvironment.smallModel;
  (env as any).LANGFUSE_AWS_BEDROCK_REGION = originalEnvironment.region;
  (env as any).LANGFUSE_IN_APP_AGENT_BEDROCK_API_KEY =
    originalEnvironment.apiKey;
});

describe("getInAppAgentModelConfig", () => {
  it("uses the default AWS credential chain when no assistant API key is configured", () => {
    (env as any).LANGFUSE_AWS_BEDROCK_MODEL = "eu.anthropic.claude-sonnet";
    (env as any).LANGFUSE_AWS_BEDROCK_SMALL_MODEL = undefined;
    (env as any).LANGFUSE_AWS_BEDROCK_REGION = "eu-central-1";
    (env as any).LANGFUSE_IN_APP_AGENT_BEDROCK_API_KEY = undefined;

    const config = getInAppAgentModelConfig();

    expect(config).toMatchObject({
      provider: "bedrock",
      modelId: "eu.anthropic.claude-sonnet",
      titleModelId: "eu.anthropic.claude-sonnet",
      region: "eu-central-1",
      authentication: { type: "default-credentials" },
    });
    expect(config).toBeDefined();
    expect(decrypt(getInAppAgentModelConnectionSecret(config!))).toBe(
      BEDROCK_USE_DEFAULT_CREDENTIALS,
    );
  });

  it("uses the explicitly configured assistant Bedrock API key", () => {
    (env as any).LANGFUSE_AWS_BEDROCK_MODEL = "eu.anthropic.claude-sonnet";
    (env as any).LANGFUSE_AWS_BEDROCK_SMALL_MODEL = "claude-haiku";
    (env as any).LANGFUSE_AWS_BEDROCK_REGION = "eu-central-1";
    (env as any).LANGFUSE_IN_APP_AGENT_BEDROCK_API_KEY = "bedrock-api-key";

    const config = getInAppAgentModelConfig();

    expect(config).toMatchObject({
      titleModelId: "claude-haiku",
      authentication: { type: "api-key", apiKey: "bedrock-api-key" },
    });
    expect(config).toBeDefined();
    expect(decrypt(getInAppAgentModelConnectionSecret(config!))).toBe(
      JSON.stringify({ apiKey: "bedrock-api-key" }),
    );
  });
});
