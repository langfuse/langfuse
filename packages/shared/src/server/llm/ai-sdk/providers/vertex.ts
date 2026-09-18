import { createVertex } from "@ai-sdk/google-vertex";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import type { LanguageModel } from "ai";
import { type GoogleAuthOptions } from "google-auth-library";

import { env } from "../../../../env";
import {
  GCPServiceAccountKeySchema,
  type LLMConnectionConfig,
  VERTEXAI_USE_DEFAULT_CREDENTIALS,
  VertexAIConfigSchema,
} from "../../../../interfaces/customLLMProviderConfigSchemas";
import type { LLMCredentialSource } from "./types";
import { resolveVertexProjectIdFromADC } from "./vertexAuth";

const ANTHROPIC_VERTEX_MODEL_NAME_PATTERN = /^[A-Za-z0-9_.@-]+$/;

// Vertex region identifiers are lowercase alphanumerics plus hyphens
// (e.g. "us-east5", "europe-west1") with the special "global"/"us"/"eu"
// endpoints. Disallowing every URL delimiter keeps an attacker-controlled
// location from reshaping the Vertex host the SDKs build from it.
const VERTEX_LOCATION_PATTERN = /^[a-z0-9-]+$/;

export function isClaudeModel(modelName: string): boolean {
  return modelName.toLowerCase().includes("claude");
}

export function assertValidAnthropicVertexModelName(modelName: string): void {
  if (
    !ANTHROPIC_VERTEX_MODEL_NAME_PATTERN.test(modelName) ||
    modelName.includes("..")
  ) {
    throw new Error(
      "Invalid Anthropic Vertex AI model name. Model names must be a single Vertex model ID segment.",
    );
  }
}

// location flows into the Vertex host the SDKs build from it
// (https://${location}-aiplatform.googleapis.com), so reject anything that
// could reshape that host and exfiltrate the Google OAuth bearer token.
export function assertValidVertexLocation(location: string | undefined): void {
  if (location !== undefined && !VERTEX_LOCATION_PATTERN.test(location)) {
    throw new Error(
      "Invalid Vertex AI location. Locations must be a single Vertex region identifier.",
    );
  }
}

/**
 * Vertex location for Langfuse-operated AI (Assistant, Ask AI). Undefined
 * falls back to the same "global" endpoint existing connections default to.
 */
export function getLangfuseAIVertexLocation(): string | undefined {
  return env.LANGFUSE_AI_VERTEX_LOCATION;
}

/**
 * Builds a Vertex AI model: Gemini via `@ai-sdk/google-vertex`, Claude via its
 * `/anthropic` entry point (Anthropic Messages over Vertex `rawPredict`).
 *
 * The decrypted secret is either a GCP service account key (project taken from
 * the key; user-supplied project IDs are never honored) or the ADC sentinel,
 * allowed for self-hosted deployments and for Langfuse-operated AI, in which
 * case the project is resolved from the default credential chain.
 */
export async function buildVertexModel(params: {
  modelId: string;
  apiKey: string;
  config?: LLMConnectionConfig | null;
  extraHeaders?: Record<string, string>;
  credentialSource: LLMCredentialSource;
  fetch: typeof fetch;
}): Promise<LanguageModel> {
  const { modelId, apiKey, config, extraHeaders, credentialSource } = params;
  const shouldUseLangfuseAPIKey = credentialSource === "langfuse";

  // Langfuse-operated AI carries no persisted connection, so its location comes
  // from the instance env instead of the connection config.
  const { location } = shouldUseLangfuseAPIKey
    ? { location: getLangfuseAIVertexLocation() }
    : config
      ? VertexAIConfigSchema.parse(config)
      : { location: undefined };
  assertValidVertexLocation(location);

  const isLangfuseCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);
  const shouldUseDefaultCredentials =
    apiKey === VERTEXAI_USE_DEFAULT_CREDENTIALS &&
    (!isLangfuseCloud || shouldUseLangfuseAPIKey);

  // Security: with ADC we intentionally ignore user-provided project IDs to
  // prevent privilege escalation via the server's credentials.
  const serviceAccountKey = shouldUseDefaultCredentials
    ? undefined
    : GCPServiceAccountKeySchema.parse(JSON.parse(apiKey));
  const googleAuthOptions: GoogleAuthOptions | undefined = serviceAccountKey
    ? {
        credentials: serviceAccountKey,
        projectId: serviceAccountKey.project_id,
      }
    : undefined;

  // The AI SDK requires an explicit project for URL construction (it does not
  // ask the auth library); resolve it from ADC when no key is configured.
  const project =
    serviceAccountKey?.project_id ?? (await resolveVertexProjectIdFromADC());

  // Existing connections default the location to "global" for both families.
  const resolvedLocation = location ?? "global";

  if (isClaudeModel(modelId)) {
    assertValidAnthropicVertexModelName(modelId);

    const provider = createVertexAnthropic({
      project,
      location: resolvedLocation,
      googleAuthOptions,
      headers: extraHeaders,
      fetch: params.fetch,
    });

    return provider(modelId);
  }

  // Extra headers are intentionally not sent for Gemini; only the OAuth
  // headers belong on this request path.
  const provider = createVertex({
    project,
    location: resolvedLocation,
    googleAuthOptions,
    fetch: params.fetch,
  });

  return provider(modelId);
}
