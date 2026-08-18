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
};

afterEach(() => {
  (env as any).LANGFUSE_AWS_BEDROCK_MODEL = originalEnvironment.model;
  (env as any).LANGFUSE_AWS_BEDROCK_SMALL_MODEL =
    originalEnvironment.smallModel;
  (env as any).LANGFUSE_AWS_BEDROCK_REGION = originalEnvironment.region;
});

describe("getInAppAgentModelConfig", () => {
  it("uses the AWS default credential chain", () => {
    (env as any).LANGFUSE_AWS_BEDROCK_MODEL = "eu.anthropic.claude-sonnet";
    (env as any).LANGFUSE_AWS_BEDROCK_SMALL_MODEL = undefined;
    (env as any).LANGFUSE_AWS_BEDROCK_REGION = "eu-central-1";

    const config = getInAppAgentModelConfig();

    expect(config).toMatchObject({
      provider: "bedrock",
      modelId: "eu.anthropic.claude-sonnet",
      titleModelId: "eu.anthropic.claude-sonnet",
      region: "eu-central-1",
    });
    expect(config).toBeDefined();
    expect(decrypt(getInAppAgentModelConnectionSecret())).toBe(
      BEDROCK_USE_DEFAULT_CREDENTIALS,
    );
  });
});
