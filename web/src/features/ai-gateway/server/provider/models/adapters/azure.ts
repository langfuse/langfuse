import { z } from "zod/v4";

import { getAzureResource } from "@/src/features/ai-gateway/fns/azureResource";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";
import { requestJson, standardHttpError } from "./shared";
import type { ModelDiscoveryAdapter } from "../types";

// Requests name a deployment, and `GET /openai/v1/models` lists the models the
// resource could deploy instead. The Foundry project API lists the deployments
// of a project; `_project` addresses the default project, which not every
// resource resolves.
// https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/aiproject
const DEFAULT_PROJECT = "_project";
const MAX_PAGES = 10;
const UNKNOWN_CREATED_AT = new Date(0).toISOString();

const responseSchema = z.object({
  value: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      modelName: z.string(),
      modelPublisher: z.string().optional(),
      capabilities: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  nextLink: z.string().optional(),
});

type Deployment = z.infer<typeof responseSchema>["value"][number];

export const azureModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, baseURL, extraHeaders, fetcher }) {
    const resource = baseURL ? getAzureResource(baseURL) : null;
    if (!baseURL || !resource) {
      return { success: false, error: "provider_error" };
    }
    const origin = new URL(baseURL).origin;
    const deployments: Deployment[] = [];
    let url: URL | null = new URL(
      `${origin}/api/projects/${resource.project ?? DEFAULT_PROJECT}/deployments?api-version=v1`,
    );
    for (let page = 0; url && page < MAX_PAGES; page++) {
      const result = await requestJson({
        fetcher,
        url,
        headers: { ...extraHeaders, "api-key": credential },
      });
      if (!result.success) return result;

      // An unknown project, or a key that may call deployments without
      // listing them (the documented contract is OAuth only), keeps the custom
      // models. The credential check rejects bad keys before this.
      if ([401, 403, 404].includes(result.response.status)) {
        return { success: true, models: [], modelListingDenied: true };
      }
      const error = standardHttpError(result.response);
      if (error) return { success: false, error };

      const parsed = responseSchema.safeParse(result.value);
      if (!parsed.success) return { success: false, error: "provider_error" };
      deployments.push(...parsed.data.value);
      url = getNextPage(parsed.data.nextLink, origin);
    }

    return {
      success: true,
      models: deployments
        .filter(({ type }) => type === "ModelDeployment")
        .map(({ name, modelName, modelPublisher, capabilities }) => {
          const apiFormats = getDeploymentApiFormats(
            modelPublisher,
            capabilities ?? {},
          );
          return {
            id: name,
            provider: "AZURE" as const,
            canonicalSlug: modelName,
            displayName: name,
            createdAt: UNKNOWN_CREATED_AT,
            ...(apiFormats && { apiFormats }),
          };
        }),
    };
  },
};

/** Follows pages only on the resource itself, which holds the API key. */
function getNextPage(nextLink: string | undefined, origin: string) {
  if (!nextLink) return null;
  const url = new URL(nextLink, origin);
  return url.origin === origin ? url : null;
}

/**
 * Capabilities use the keys of the Azure OpenAI models list, with string
 * values. The Responses API serves only OpenAI models, and Claude deployments
 * only the Anthropic API. Deployments without a known capability report no
 * formats, so every format is tried.
 */
function getDeploymentApiFormats(
  publisher: string | undefined,
  capabilities: Record<string, unknown>,
): GatewayApiFormat[] | undefined {
  if (publisher === "Anthropic") return ["anthropic.messages"];
  const has = (key: string) => String(capabilities[key]) === "true";
  const formats: GatewayApiFormat[] = [];
  if (has("chat_completion")) {
    if (publisher === "OpenAI") formats.push("openai.responses");
    formats.push("openai.chat-completions");
  }
  if (has("embeddings")) formats.push("openai.embeddings");
  return formats.length > 0 ? formats : undefined;
}
