import { createHash } from "node:crypto";

import { createAzure } from "@ai-sdk/azure";
import {
  AggregateAuthenticationError,
  AuthenticationError,
  AuthenticationRequiredError,
  ClientSecretCredential,
  CredentialUnavailableError,
  DefaultAzureCredential,
  getBearerTokenProvider,
  type TokenCredential,
} from "@azure/identity";
import { APICallError, type LanguageModel } from "ai";

import { env } from "../../../../env";
import {
  type AzureEntraServicePrincipal,
  parseAzureCredential,
} from "../../../../interfaces/customLLMProviderConfigSchemas";
import { LLMValidationError } from "../../errors";
import { trimTrailingSlashes } from "./utils";

// Pinned to the API version used by existing Langfuse Azure connections.
const AZURE_OPENAI_API_VERSION = "2025-02-01-preview";

// Audience accepted by Azure OpenAI and Azure AI Foundry model endpoints.
const AZURE_ENTRA_TOKEN_SCOPE = "https://cognitiveservices.azure.com/.default";

const AZURE_ENTRA_AUTHORITY_URL = "https://login.microsoftonline.com";

// A default-credential token belongs to the Langfuse deployment, not to the
// connection's author, so it may only be sent to Azure-operated model hosts.
// Gateways (e.g. API Management) are excluded because anyone can create one
// and read the forwarded Authorization header.
const AZURE_DEFAULT_CREDENTIAL_HOST_SUFFIXES = [
  ".openai.azure.com",
  ".cognitiveservices.azure.com",
  ".services.ai.azure.com",
];

// Each cached credential holds its own MSAL token cache, so reusing it across
// completions avoids a token request per evaluation.
const MAX_CACHED_SERVICE_PRINCIPAL_CREDENTIALS = 256;

type AzureTokenProvider = () => Promise<string>;

type AzureProviderAuth =
  | { apiKey: string; tokenProvider?: undefined }
  | { apiKey?: undefined; tokenProvider: AzureTokenProvider };

const servicePrincipalTokenProviders = new Map<string, AzureTokenProvider>();
let defaultCredentialTokenProvider: AzureTokenProvider | undefined;

export function assertAzureHostAllowedForDefaultCredentials(
  baseURL: string,
): void {
  const url = new URL(baseURL);
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    !AZURE_DEFAULT_CREDENTIAL_HOST_SUFFIXES.some((suffix) =>
      hostname.endsWith(suffix),
    )
  ) {
    throw new LLMValidationError({
      code: "invalid-connection",
      message: `Default Azure credentials can only be used with Azure OpenAI or Azure AI Foundry endpoints (https://*${AZURE_DEFAULT_CREDENTIAL_HOST_SUFFIXES.join(", https://*")}).`,
    });
  }
}

function toEntraTokenError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;

  // ClientSecretCredential reports rejected tenants, secrets, and Conditional
  // Access blocks as AuthenticationRequiredError.
  const isCredentialError =
    error instanceof AuthenticationError ||
    error instanceof AuthenticationRequiredError ||
    error instanceof AggregateAuthenticationError ||
    error instanceof CredentialUnavailableError;

  let statusCode: number | undefined;
  if (error instanceof AuthenticationError) {
    statusCode = error.statusCode;
  } else if (isCredentialError) {
    statusCode = 401;
  }

  return new APICallError({
    message: `Failed to obtain a Microsoft Entra ID access token: ${error.message}`,
    url: AZURE_ENTRA_AUTHORITY_URL,
    requestBodyValues: {},
    statusCode,
    // Rejected or unavailable credentials are configuration errors; Entra
    // outages and network failures are transient.
    isRetryable: !isCredentialError || (statusCode ?? 0) >= 500,
    cause: error,
  });
}

function createEntraTokenProvider(
  credential: TokenCredential,
): AzureTokenProvider {
  const getToken = getBearerTokenProvider(credential, AZURE_ENTRA_TOKEN_SCOPE);
  return async () => {
    try {
      return await getToken();
    } catch (error) {
      throw toEntraTokenError(error);
    }
  };
}

function getServicePrincipalTokenProvider(
  servicePrincipal: AzureEntraServicePrincipal,
): AzureTokenProvider {
  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify([
        servicePrincipal.tenantId,
        servicePrincipal.clientId,
        servicePrincipal.clientSecret,
      ]),
    )
    .digest("hex");

  const cached = servicePrincipalTokenProviders.get(cacheKey);
  if (cached) {
    // Re-insert to keep the map ordered by recency for eviction.
    servicePrincipalTokenProviders.delete(cacheKey);
    servicePrincipalTokenProviders.set(cacheKey, cached);
    return cached;
  }

  const tokenProvider = createEntraTokenProvider(
    new ClientSecretCredential(
      servicePrincipal.tenantId,
      servicePrincipal.clientId,
      servicePrincipal.clientSecret,
    ),
  );

  servicePrincipalTokenProviders.set(cacheKey, tokenProvider);
  if (
    servicePrincipalTokenProviders.size >
    MAX_CACHED_SERVICE_PRINCIPAL_CREDENTIALS
  ) {
    const oldestKey = servicePrincipalTokenProviders.keys().next().value;
    if (oldestKey !== undefined) {
      servicePrincipalTokenProviders.delete(oldestKey);
    }
  }

  return tokenProvider;
}

function getDefaultCredentialTokenProvider(): AzureTokenProvider {
  if (!defaultCredentialTokenProvider) {
    defaultCredentialTokenProvider = createEntraTokenProvider(
      new DefaultAzureCredential(),
    );
  }
  return defaultCredentialTokenProvider;
}

/**
 * Resolves how an Azure connection authenticates: an `api-key` header, or a
 * Microsoft Entra ID bearer token from a service principal or, on
 * self-hosted deployments only, the server's default Azure credential chain.
 */
export function resolveAzureProviderAuth(params: {
  secretKey: string;
  baseURL: string;
  extraHeaders?: Record<string, string>;
}): AzureProviderAuth {
  let credential;
  try {
    credential = parseAzureCredential(params.secretKey);
  } catch (error) {
    throw new LLMValidationError({
      code: "invalid-connection",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (credential.type === "api-key") {
    return { apiKey: credential.apiKey };
  }

  // The AI SDK only adds the Entra bearer token when no Authorization header
  // is present, so a custom one would silently replace it.
  if (
    Object.keys(params.extraHeaders ?? {}).some(
      (header) => header.toLowerCase() === "authorization",
    )
  ) {
    throw new LLMValidationError({
      code: "invalid-connection",
      message:
        "Remove the Authorization extra header: Microsoft Entra ID authentication sets it.",
    });
  }

  if (credential.type === "service-principal") {
    return { tokenProvider: getServicePrincipalTokenProvider(credential) };
  }

  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    throw new LLMValidationError({
      code: "invalid-connection",
      message:
        "Default Azure credentials are only available in self-hosted deployments.",
    });
  }
  assertAzureHostAllowedForDefaultCredentials(params.baseURL);

  return { tokenProvider: getDefaultCredentialTokenProvider() };
}

export type AzureBaseURLTranslation =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * Langfuse historically passed Azure base paths directly to LangChain as
 * `azureOpenAIBasePath`. Existing connections therefore contain several valid
 * shapes:
 *
 * - `https://{instance}.openai.azure.com/openai`
 * - `https://{instance}.openai.azure.com/openai/deployments`
 * - `https://{instance}.openai.azure.com/openai/deployments/{deployment}`
 * - a proxy-specific prefix that is not an Azure resource URL
 *
 * The AI SDK's deployment-based mode appends
 * `/deployments/{deployment}{path}` to its `baseURL`, so any persisted URL that
 * already contains `/deployments` is normalized back to its parent prefix.
 * Unknown custom prefixes are passed through for proxy compatibility.
 */
export function translateAzureBaseURL(
  baseURL: string | null | undefined,
): AzureBaseURLTranslation {
  if (!baseURL) {
    return { ok: false, reason: "Azure connections require a base URL" };
  }

  const trimmed = trimTrailingSlashes(baseURL);
  const [pathWithoutQuery] = trimmed.split(/[?#]/, 1);
  const pathSegments = pathWithoutQuery.split("/");
  const deploymentsIndex = pathSegments.findIndex(
    (segment) => segment === "deployments",
  );
  if (deploymentsIndex >= 0) {
    return {
      ok: true,
      value: trimTrailingSlashes(
        pathSegments.slice(0, deploymentsIndex).join("/"),
      ),
    };
  }

  return { ok: true, value: trimmed };
}

export function buildAzureModel(params: {
  modelId: string;
  apiKey: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  fetch: typeof fetch;
}): LanguageModel {
  const baseUrlTranslation = translateAzureBaseURL(params.baseURL);
  if (!baseUrlTranslation.ok) {
    // Configuration validation runs before model construction; keep this
    // defensive guard so the provider cannot be built from an invalid URL.
    throw new Error(baseUrlTranslation.reason);
  }

  const auth = resolveAzureProviderAuth({
    secretKey: params.apiKey,
    baseURL: baseUrlTranslation.value,
    extraHeaders: params.extraHeaders,
  });

  const provider = createAzure({
    ...auth,
    baseURL: baseUrlTranslation.value,
    apiVersion: AZURE_OPENAI_API_VERSION,
    useDeploymentBasedUrls: true,
    headers: params.extraHeaders,
    fetch: params.fetch,
  });

  // Azure connections use Chat Completions; the model name is the deployment.
  return provider.chat(params.modelId);
}
