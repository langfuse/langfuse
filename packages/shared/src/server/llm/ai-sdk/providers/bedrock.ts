import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { type EmbeddingModel, type LanguageModel } from "ai";

import { env } from "../../../../env";
import {
  BEDROCK_USE_DEFAULT_CREDENTIALS,
  BedrockConfigSchema,
  BedrockCredentialSchema,
  type LLMConnectionConfig,
} from "../../../../interfaces/customLLMProviderConfigSchemas";
import {
  OutboundUrlValidationError,
  parseOutboundUrl,
} from "../../../outbound-url";
import { llmBaseUrlWhitelistFromEnv } from "../../baseUrlValidation";
import type { LLMCredentialSource, TranslatedProviderOptions } from "./types";
import { isPlainObject } from "./utils";

// AWS region identifiers are lowercase alphanumerics plus hyphens
// (e.g. "us-east-1", "eu-central-1"). The region flows into the Bedrock host
// the AI SDK builds (https://bedrock-runtime.${region}.amazonaws.com) and this
// path intentionally skips the secure LLM fetch, so reject anything that
// could reshape that host. The AWS SDK applies equivalent host-label
// validation, but this provider builds its own endpoint.
const AWS_REGION_PATTERN = /^[a-z0-9-]+$/;

// Same order as @ai-sdk/amazon-bedrock resolveAmazonBedrockBaseURL. An earlier
// prefix wins, including where a longer prefix also matches.
const BEDROCK_PARTITION_DNS_SUFFIXES = [
  { regionPrefix: "cn-", dnsSuffix: "amazonaws.com.cn" },
  { regionPrefix: "us-iso-", dnsSuffix: "c2s.ic.gov" },
  { regionPrefix: "us-isob-", dnsSuffix: "sc2s.sgov.gov" },
  { regionPrefix: "eu-isoe-", dnsSuffix: "cloud.adc-e.uk" },
  { regionPrefix: "us-isof-", dnsSuffix: "csp.hci.ic.gov" },
  { regionPrefix: "eusc-", dnsSuffix: "amazonaws.eu" },
] as const;

export function assertValidBedrockRegion(region: string | undefined): void {
  if (region !== undefined && !AWS_REGION_PATTERN.test(region)) {
    throw new Error(
      "Invalid Bedrock region. Regions must be a single AWS region identifier.",
    );
  }
}

/**
 * Bedrock region for Langfuse-operated AI (Assistant, Ask AI). Undefined lets
 * the AWS SDK fall back to the task region.
 */
export function getLangfuseAIBedrockRegion(): string | undefined {
  return env.LANGFUSE_AI_AWS_BEDROCK_REGION;
}

/** Local profile shared by Langfuse AI features, with the ambient AWS profile taking precedence. */
export function getLangfuseAIAwsProfile(): string | undefined {
  return (
    env.AWS_PROFILE ??
    env.LANGFUSE_AI_FEATURES_AWS_PROFILE ??
    env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE
  );
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
 * Returns the Bedrock auth options for the AWS default credential chain.
 *
 * The empty API key deliberately prevents the AI SDK from selecting an
 * ambient AWS_BEARER_TOKEN_BEDROCK value ahead of the configured AWS
 * credentials. An optional profile is useful for local worker development;
 * production workloads should normally rely on the default AWS role chain.
 */
export function createDefaultBedrockProviderAuth(params?: {
  profile?: string;
}): Pick<
  Parameters<typeof createAmazonBedrock>[0] & object,
  "apiKey" | "credentialProvider"
> {
  const profile = params?.profile;
  return {
    credentialProvider: fromNodeProviderChain(profile ? { profile } : {}),
    ...SUPPRESS_BEARER_TOKEN_ENV_FALLBACK,
  };
}

/** Cloud uses the existing project allowlist for runtime credentials. */
export function canUseBedrockDefaultCredentials(projectId?: string): boolean {
  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) return true;
  const allowedProjects =
    env.LANGFUSE_BEDROCK_LLM_CONNECTION_RUNTIME_CREDENTIALS_ALLOWED_PROJECT_IDS;
  return Boolean(
    projectId &&
    Array.isArray(allowedProjects) &&
    allowedProjects.includes(projectId),
  );
}

/** Resolves a default-credential sentinel, AWS access key JSON, or Bedrock API key. */
export function resolveBedrockProviderAuth(params: {
  secretKey: string;
  allowDefaultCredentials: boolean;
  profile?: string;
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
    return createDefaultBedrockProviderAuth({ profile: params.profile });
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

/** bedrockPartitionDnsSuffix returns the AWS partition suffix for a region. */
function bedrockPartitionDnsSuffix(region: string): string {
  return (
    BEDROCK_PARTITION_DNS_SUFFIXES.find(({ regionPrefix }) =>
      region.startsWith(regionPrefix),
    )?.dnsSuffix ?? "amazonaws.com"
  );
}

/** readProcessEnv reads one variable at call time, matching the Bedrock SDK. */
function readProcessEnv(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" ? value : undefined;
}

/** bedrockRuntimeHostname returns the host the Bedrock runtime transport calls. */
function bedrockRuntimeHostname(region: string | undefined): string {
  const endpoint =
    readProcessEnv("AWS_ENDPOINT_URL_BEDROCK_RUNTIME") ??
    readProcessEnv("AWS_ENDPOINT_URL");
  if (endpoint != null) {
    return parseOutboundUrl(endpoint).hostname;
  }

  const resolvedRegion = region ?? readProcessEnv("AWS_REGION");
  if (!resolvedRegion) {
    throw new Error(
      "Bedrock region is required when an LLM host allowlist is configured.",
    );
  }
  assertValidBedrockRegion(resolvedRegion);
  return `bedrock-runtime.${resolvedRegion}.${bedrockPartitionDnsSuffix(resolvedRegion)}`;
}

/** assertBedrockHostAllowed rejects a Bedrock host outside a configured LLM allowlist. */
function assertBedrockHostAllowed(region: string | undefined): void {
  const allowedHosts = llmBaseUrlWhitelistFromEnv().allowedHosts ?? [];
  if (allowedHosts.length === 0) return;

  const hostname = bedrockRuntimeHostname(region);
  if (allowedHosts.includes(hostname)) return;

  throw new OutboundUrlValidationError(
    "host-not-allowed",
    "Host is not in the outbound URL allowlist",
  );
}

/**
 * No custom fetch is used: Bedrock has no user-controlled base URL (the host
 * is derived from the region), and self-hosted deployments commonly reach
 * Bedrock through VPC endpoints resolving to private IPs, which the secure
 * LLM fetch would block. Requests therefore use the provider's AWS transport.
 * A configured LLM host allowlist is still applied to that transport's host.
 */
function createBedrockProvider(params: {
  projectId?: string;
  apiKey: string;
  config?: LLMConnectionConfig | null;
  credentialSource: LLMCredentialSource;
}) {
  const { apiKey, config, credentialSource } = params;
  const shouldUseLangfuseAPIKey = credentialSource === "langfuse";

  const { region } = shouldUseLangfuseAPIKey
    ? { region: getLangfuseAIBedrockRegion() }
    : BedrockConfigSchema.parse(config);
  assertValidBedrockRegion(region);
  assertBedrockHostAllowed(region);

  const auth = resolveBedrockProviderAuth({
    secretKey: apiKey,
    allowDefaultCredentials:
      shouldUseLangfuseAPIKey ||
      canUseBedrockDefaultCredentials(params.projectId),
    profile: shouldUseLangfuseAPIKey ? getLangfuseAIAwsProfile() : undefined,
  });

  return createAmazonBedrock({
    region,
    ...auth,
  });
}

export function buildBedrockModel(params: {
  projectId?: string;
  modelId: string;
  apiKey: string;
  config?: LLMConnectionConfig | null;
  credentialSource: LLMCredentialSource;
}): LanguageModel {
  return createBedrockProvider(params)(params.modelId);
}

export function buildBedrockEmbeddingModel(params: {
  projectId?: string;
  modelId: string;
  apiKey: string;
  config?: LLMConnectionConfig | null;
  credentialSource: LLMCredentialSource;
}): EmbeddingModel {
  return createBedrockProvider(params).embeddingModel(params.modelId);
}
