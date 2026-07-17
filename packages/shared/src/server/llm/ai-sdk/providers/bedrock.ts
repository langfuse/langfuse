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
import type { LLMCredentialSource, TranslatedProviderOptions } from "./types";
import { isPlainObject } from "./utils";

// AWS region identifiers are lowercase alphanumerics plus hyphens
// (e.g. "us-east-1", "eu-central-1"). The region flows into the Bedrock host
// the AI SDK builds (https://bedrock-runtime.${region}.amazonaws.com) and this
// path intentionally skips the secure LLM fetch, so reject anything that
// could reshape that host. The AWS SDK applies equivalent host-label
// validation, but this provider builds its own endpoint.
const AWS_REGION_PATTERN = /^[a-z0-9-]+$/;

export function assertValidBedrockRegion(region: string | undefined): void {
  if (region !== undefined && !AWS_REGION_PATTERN.test(region)) {
    throw new Error(
      "Invalid Bedrock region. Regions must be a single AWS region identifier.",
    );
  }
}

/**
 * Translation of Langfuse `modelParams.providerOptions` to AI SDK Bedrock
 * provider options.
 *
 * Persisted provider options pass through as the Converse API's
 * `additionalModelRequestFields`; the AI SDK exposes that escape
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

  // A non-object `bedrock` key is not an escape hatch; keep it in the
  // verbatim request-field passthrough.
  const passthrough = isPlainObject(nested)
    ? rest
    : { ...rest, ...(nested !== undefined ? { bedrock: nested } : {}) };

  const translated: Record<string, unknown> = {
    ...(Object.keys(passthrough).length > 0
      ? { additionalModelRequestFields: passthrough }
      : {}),
  };

  if (isPlainObject(nested)) {
    Object.assign(translated, nested);
  }

  return {
    ok: true,
    value: Object.keys(translated).length > 0 ? translated : undefined,
  };
}

// `createAmazonBedrock` defaults an unset `apiKey` from the server's
// AWS_BEARER_TOKEN_BEDROCK env var, and a resolved bearer token wins over
// every other credential form — a tenant's access keys would silently
// authenticate as the server. An empty string suppresses the fallback
// (`loadOptionalSetting` returns any string verbatim; the provider treats
// empty as unset and proceeds with SigV4) so auth only ever comes from the
// resolved Langfuse connection credential. Pinned by a regression test in
// requestShape.test.ts.
const SUPPRESS_BEARER_TOKEN_ENV_FALLBACK = { apiKey: "" };

/**
 * Resolves the persisted Bedrock credential contract: the decrypted secret is
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
    // includes env, profile, IMDS, IRSA, and the remaining AWS defaults.
    return {
      credentialProvider: fromNodeProviderChain(),
      ...SUPPRESS_BEARER_TOKEN_ENV_FALLBACK,
    };
  }

  try {
    const parsedCredential = BedrockCredentialSchema.parse(
      JSON.parse(secretKey),
    );

    if ("apiKey" in parsedCredential) {
      return { apiKey: parsedCredential.apiKey };
    }

    // Note: the provider only reads AWS_SESSION_TOKEN when the access keys
    // come from the environment; with both keys passed explicitly it uses the
    // (unset) option value, so no server session token can leak in here.
    return {
      accessKeyId: parsedCredential.accessKeyId,
      secretAccessKey: parsedCredential.secretAccessKey,
      ...SUPPRESS_BEARER_TOKEN_ENV_FALLBACK,
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
 * LLM fetch would block. Requests therefore use the provider's AWS transport.
 */
export function buildBedrockModel(params: {
  modelId: string;
  apiKey: string;
  config?: LLMConnectionConfig | null;
  credentialSource: LLMCredentialSource;
}): LanguageModel {
  const { modelId, apiKey, config, credentialSource } = params;
  const shouldUseLangfuseAPIKey = credentialSource === "langfuse";

  const { region } = shouldUseLangfuseAPIKey
    ? { region: env.LANGFUSE_AWS_BEDROCK_REGION }
    : BedrockConfigSchema.parse(config);
  assertValidBedrockRegion(region);

  const isSelfHosted = !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const auth = resolveBedrockProviderAuth({
    secretKey: apiKey,
    allowDefaultCredentials: isSelfHosted || shouldUseLangfuseAPIKey,
  });

  const provider = createAmazonBedrock({
    region,
    ...auth,
  });

  return provider(modelId);
}
