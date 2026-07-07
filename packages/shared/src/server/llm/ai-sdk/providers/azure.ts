import { createAzure } from "@ai-sdk/azure";
import type { LanguageModel } from "ai";

import type { ModelParams } from "../../types";

// Pinned to the version the LangChain engine sends
// (`AzureChatOpenAI.azureOpenAIApiVersion`) so both engines hit the identical
// Azure API surface.
const AZURE_OPENAI_API_VERSION = "2025-02-01-preview";

export type AzureBaseURLTranslation =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * Langfuse stores the LangChain `azureOpenAIBasePath`, documented as
 * `https://{instance}.openai.azure.com/openai/deployments`; LangChain appends
 * `/{deployment}/chat/completions?api-version=...`. The AI SDK's
 * `useDeploymentBasedUrls` mode appends `/deployments/{deployment}{path}` to
 * its `baseURL`, so the stored URL maps by stripping the trailing
 * `/deployments` segment. Any other shape has no AI SDK equivalent (the
 * request URL would silently change), so the dispatcher declines to LangChain.
 */
export function translateAzureBaseURL(
  baseURL: string | null | undefined,
): AzureBaseURLTranslation {
  if (!baseURL) {
    return { ok: false, reason: "Azure connections require a base URL" };
  }

  const trimmed = baseURL.replace(/\/+$/, "");
  if (!trimmed.endsWith("/deployments")) {
    return {
      ok: false,
      reason: "Azure base URL does not end with /deployments",
    };
  }

  return { ok: true, value: trimmed.slice(0, -"/deployments".length) };
}

export function buildAzureModel(params: {
  modelParams: ModelParams;
  apiKey: string;
  baseURL?: string | null;
  extraHeaders?: Record<string, string>;
  fetch: typeof fetch;
}): LanguageModel {
  const baseUrlTranslation = translateAzureBaseURL(params.baseURL);
  if (!baseUrlTranslation.ok) {
    // The dispatcher only selects the AI SDK engine for translatable base
    // URLs, so this is a defensive guard against drift.
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

  // Chat Completions to match `AzureChatOpenAI`; the model name is the Azure
  // deployment name.
  return provider.chat(params.modelParams.model);
}
