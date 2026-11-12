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

const pageSchema = z.object({
  value: z.array(z.unknown()),
  nextLink: z.string().nullish(),
});

// Deployments of other types, or of connected resources (`connectionName`),
// aren't served by this resource, so they are skipped rather than failing.
const deploymentSchema = z.object({
  name: z.string(),
  type: z.literal("ModelDeployment"),
  modelName: z.string(),
  modelPublisher: z.string().nullish(),
  capabilities: z.record(z.string(), z.unknown()).nullish(),
  connectionName: z.string().nullish(),
});

type Deployment = z.infer<typeof deploymentSchema>;

export const azureModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, baseURL, extraHeaders, fetcher }) {
    const resource = baseURL ? getAzureResource(baseURL) : null;
    if (!baseURL || !resource) {
      return { success: false, error: "provider_error" };
    }
    const origin = new URL(baseURL).origin;
    const headers = { ...extraHeaders, "api-key": credential };
    const deployments: Deployment[] = [];
    let url: URL | null = new URL(
      `${origin}/api/projects/${resource.project ?? DEFAULT_PROJECT}/deployments?api-version=v1`,
    );
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await requestJson({ fetcher, url, headers });
      if (!result.success) return result;

      // An unknown project, or a key that may call deployments without
      // listing them (the documented contract is OAuth only), keeps the custom
      // models. A key the resource rejects outright is reported as such.
      const { status } = result.response;
      if (status === 401 || status === 403) {
        return (await isKeyRejected({ fetcher, origin, credential }))
          ? { success: false, error: "unauthorized" }
          : { success: true, models: [], modelListingDenied: true };
      }
      if (status === 404) {
        return { success: true, models: [], modelListingDenied: true };
      }
      const error = standardHttpError(result.response);
      if (error) return { success: false, error };

      const parsed = pageSchema.safeParse(result.value);
      if (!parsed.success) return { success: false, error: "provider_error" };
      for (const item of parsed.data.value) {
        const deployment = deploymentSchema.safeParse(item);
        if (deployment.success && !deployment.data.connectionName) {
          deployments.push(deployment.data);
        }
      }

      if (!parsed.data.nextLink) {
        return { success: true, models: deployments.map(toCatalogEntry) };
      }
      url = new URL(parsed.data.nextLink, origin);
      // Only the resource itself may receive the API key.
      if (url.origin !== origin) {
        return { success: false, error: "provider_error" };
      }
    }

    // A truncated listing would pass for the whole catalog.
    return { success: false, error: "provider_error" };
  },
};

/** Sends the request the credential check sends when a connection is saved. */
async function isKeyRejected(params: {
  fetcher: typeof fetch;
  origin: string;
  credential: string;
}) {
  const result = await requestJson({
    fetcher: params.fetcher,
    url: new URL(`${params.origin}/openai/v1/models`),
    headers: { authorization: `Bearer ${params.credential}` },
  });
  return (
    result.success &&
    (result.response.status === 401 || result.response.status === 403)
  );
}

function toCatalogEntry({
  name,
  modelName,
  modelPublisher,
  capabilities,
}: Deployment) {
  const apiFormats = getDeploymentApiFormats(
    modelPublisher ?? undefined,
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
