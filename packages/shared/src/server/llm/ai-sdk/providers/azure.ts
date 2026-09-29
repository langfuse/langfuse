import { createAzure } from "@ai-sdk/azure";
import type { LanguageModel } from "ai";

import { trimTrailingSlashes } from "./utils";

// Pinned to the API version used by existing Langfuse Azure connections.
const AZURE_OPENAI_API_VERSION = "2025-02-01-preview";

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

  const provider = createAzure({
    apiKey: params.apiKey,
    baseURL: baseUrlTranslation.value,
    apiVersion: AZURE_OPENAI_API_VERSION,
    useDeploymentBasedUrls: true,
    headers: params.extraHeaders,
    fetch: params.fetch,
  });

  // Azure connections use Chat Completions; the model name is the deployment.
  return provider.chat(params.modelId);
}
