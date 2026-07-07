import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import type { LanguageModel } from "ai";

import { env } from "../../../../env";
import {
  BEDROCK_USE_DEFAULT_CREDENTIALS,
  BedrockConfigSchema,
  BedrockCredentialSchema,
  type LLMConnectionConfig,
} from "../../../../interfaces/customLLMProviderConfigSchemas";
import type { ModelParams } from "../../types";
import type { TranslatedProviderOptions } from "./types";

/**
 * Translation of Langfuse `modelParams.providerOptions` to AI SDK Bedrock
 * provider options.
 *
 * The LangChain engine passes `providerOptions` verbatim as the Converse API's
 * `additionalModelRequestFields`; the AI SDK exposes the identical escape
 * hatch under `providerOptions.bedrock.additionalModelRequestFields`, so the
 * translation is lossless and never declines. A nested `bedrock` object is
 * treated as already AI SDK-shaped (e.g. `reasoningConfig`) and merged at the
 * top level instead.
 */
export function translateBedrockProviderOptions(
  providerOptions: Record<string, unknown> | undefined,
): TranslatedProviderOptions {
  if (!providerOptions || Object.keys(providerOptions).length === 0) {
    return { ok: true, value: undefined };
  }

  const { bedrock: nested, ...rest } = providerOptions;

  const translated: Record<string, unknown> = {
    ...(Object.keys(rest).length > 0
      ? { additionalModelRequestFields: rest }
      : {}),
  };

  if (typeof nested === "object" && nested !== null) {
    Object.assign(translated, nested);
  }

  return {
    ok: true,
    value: Object.keys(translated).length > 0 ? translated : undefined,
  };
}

/**
 * Mirrors `resolveBedrockAuth` on the LangChain path: the decrypted secret is
 * either the default-credentials sentinel (allowed only self-hosted or for
 * Langfuse-internal AI features), AWS access key JSON, or a Bedrock API key
 * used as a bearer token.
 */
export function resolveBedrockProviderAuth(params: {
  secretKey: string;
  allowDefaultCredentials: boolean;
}): Pick<
  Parameters<typeof createAmazonBedrock>[0] & object,
  "accessKeyId" | "secretAccessKey" | "apiKey" | "credentialProvider"
> {
  const { secretKey, allowDefaultCredentials } = params;

  if (
    secretKey === BEDROCK_USE_DEFAULT_CREDENTIALS &&
    allowDefaultCredentials
  ) {
    // Unlike the AI SDK's built-in env-only fallback, the node provider chain
    // matches the AWS SDK default chain the LangChain engine used (env,
    // profile, IMDS, IRSA, ...).
    return { credentialProvider: fromNodeProviderChain() };
  }

  try {
    const parsedCredential = BedrockCredentialSchema.parse(
      JSON.parse(secretKey),
    );

    if ("apiKey" in parsedCredential) {
      return { apiKey: parsedCredential.apiKey };
    }

    return {
      accessKeyId: parsedCredential.accessKeyId,
      secretAccessKey: parsedCredential.secretAccessKey,
    };
  } catch {
    throw new Error(
      "Invalid Bedrock credentials. Expected AWS access key JSON or a Bedrock API key.",
    );
  }
}

/**
 * No custom fetch is used: Bedrock has no user-controlled base URL (the host
 * is derived from the region), and self-hosted deployments commonly reach
 * Bedrock through VPC endpoints resolving to private IPs, which the secure
 * LLM fetch would block. This matches the LangChain engine, which also issued
 * plain SDK requests.
 */
export function buildBedrockModel(params: {
  modelParams: ModelParams;
  apiKey: string;
  config?: LLMConnectionConfig | null;
  shouldUseLangfuseAPIKey: boolean;
}): LanguageModel {
  const { modelParams, apiKey, config, shouldUseLangfuseAPIKey } = params;

  const { region } = shouldUseLangfuseAPIKey
    ? { region: env.LANGFUSE_AWS_BEDROCK_REGION }
    : BedrockConfigSchema.parse(config);

  const isSelfHosted = !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const auth = resolveBedrockProviderAuth({
    secretKey: apiKey,
    allowDefaultCredentials: isSelfHosted || shouldUseLangfuseAPIKey,
  });

  const provider = createAmazonBedrock({
    region,
    ...auth,
  });

  return provider(modelParams.model);
}
