import { createAzure } from "@ai-sdk/azure";
import type { LanguageModel } from "ai";

import { trimTrailingSlashes } from "./utils";

// Pinned to the API version used by existing Langfuse Azure connections.
const AZURE_OPENAI_API_VERSION = "2025-02-01-preview";

export type AzureBaseURLTranslation =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * Langfuse stores the Azure base path as
 * `https://{instance}.openai.azure.com/openai/deployments`, with the
 * deployment and chat-completions path appended at request time. The AI SDK's
 * `useDeploymentBasedUrls` mode appends `/deployments/{deployment}{path}` to
 * its `baseURL`, so the stored URL maps by stripping the trailing
 * `/deployments` segment. Any other shape has no AI SDK equivalent and is
 * rejected rather than silently changing the request URL.
 */
export function translateAzureBaseURL(
  baseURL: string | null | undefined,
): AzureBaseURLTranslation {
  if (!baseURL) {
    return { ok: false, reason: "Azure connections require a base URL" };
  }

  const trimmed = trimTrailingSlashes(baseURL);
  if (!trimmed.endsWith("/deployments")) {
    return {
      ok: false,
      reason: "Azure base URL does not end with /deployments",
    };
  }

  return { ok: true, value: trimmed.slice(0, -"/deployments".length) };
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
