import { z } from "zod/v4";

import { getBedrockModelApiFormats } from "@/src/features/ai-gateway/fns/getBedrockModelApiFormats";
import {
  bedrockControlPlaneOrigin,
  decodeBedrockApiKey,
  GatewayBedrockConfigSchema,
} from "@/src/features/ai-gateway/server/provider/bedrock";
import { requestJson, standardHttpError } from "./shared";
import type { GatewayModelCatalogEntry, ModelDiscoveryAdapter } from "../types";

// Neither list returns a creation date for every entry.
const UNKNOWN_CREATED_AT = new Date(0).toISOString();

// API contract: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListFoundationModels.html
const foundationModelsSchema = z.object({
  modelSummaries: z.array(
    z.object({
      modelId: z.string(),
      modelName: z.string().optional(),
      modelLifecycle: z.object({ status: z.string() }).optional(),
    }),
  ),
});

// API contract: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListInferenceProfiles.html
const inferenceProfilesSchema = z.object({
  inferenceProfileSummaries: z.array(
    z.object({
      inferenceProfileId: z.string(),
      inferenceProfileName: z.string().optional(),
      status: z.string().optional(),
      createdAt: z.coerce.date().optional().catch(undefined),
    }),
  ),
  nextToken: z.string().nullable().optional(),
});

// Lists on-demand foundation models plus system-defined inference profiles,
// because newer models (e.g. OpenAI GPT on Bedrock) are only invocable through
// a `us.`/`global.` profile ID.
export const bedrockModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, config, fetcher }) {
    const parsedConfig = GatewayBedrockConfigSchema.safeParse(config);
    if (!parsedConfig.success)
      return { success: false, error: "provider_error" };
    const origin = bedrockControlPlaneOrigin(parsedConfig.data);
    const headers = {
      authorization: `Bearer ${decodeBedrockApiKey(credential)}`,
    };

    const foundationModelsUrl = new URL(`${origin}/foundation-models`);
    foundationModelsUrl.searchParams.set("byInferenceType", "ON_DEMAND");
    foundationModelsUrl.searchParams.set("byOutputModality", "TEXT");
    const foundationModels = await requestJson({
      fetcher,
      url: foundationModelsUrl,
      headers,
    });
    if (!foundationModels.success) return foundationModels;
    const foundationModelsError = standardHttpError(foundationModels.response);
    if (foundationModelsError) {
      return { success: false, error: foundationModelsError };
    }
    const parsedFoundationModels = foundationModelsSchema.safeParse(
      foundationModels.value,
    );
    if (!parsedFoundationModels.success) {
      return { success: false, error: "provider_error" };
    }

    // LEGACY models are being retired and stop working at their end-of-life date.
    const models: GatewayModelCatalogEntry[] =
      parsedFoundationModels.data.modelSummaries
        .filter((model) => model.modelLifecycle?.status !== "LEGACY")
        .map((model) => ({
          id: model.modelId,
          provider: "BEDROCK" as const,
          canonicalSlug: model.modelId,
          displayName: model.modelName ?? model.modelId,
          createdAt: UNKNOWN_CREATED_AT,
        }));

    let nextToken: string | undefined;
    for (let page = 0; page < 100; page += 1) {
      const profilesUrl = new URL(`${origin}/inference-profiles`);
      profilesUrl.searchParams.set("type", "SYSTEM_DEFINED");
      profilesUrl.searchParams.set("maxResults", "1000");
      if (nextToken) profilesUrl.searchParams.set("nextToken", nextToken);

      const profiles = await requestJson({
        fetcher,
        url: profilesUrl,
        headers,
      });
      if (!profiles.success) return profiles;
      const profilesError = standardHttpError(profiles.response);
      if (profilesError) return { success: false, error: profilesError };
      const parsedProfiles = inferenceProfilesSchema.safeParse(profiles.value);
      if (!parsedProfiles.success) {
        return { success: false, error: "provider_error" };
      }

      models.push(
        ...parsedProfiles.data.inferenceProfileSummaries
          .filter((profile) => profile.status === "ACTIVE")
          .map((profile) => ({
            id: profile.inferenceProfileId,
            provider: "BEDROCK" as const,
            canonicalSlug: profile.inferenceProfileId,
            displayName:
              profile.inferenceProfileName ?? profile.inferenceProfileId,
            createdAt: profile.createdAt?.toISOString() ?? UNKNOWN_CREATED_AT,
          })),
      );

      if (!parsedProfiles.data.nextToken) {
        return { success: true, models: models.filter(isServedByGateway) };
      }
      nextToken = parsedProfiles.data.nextToken;
    }

    return { success: false, error: "provider_error" };
  },
};

// Models such as Amazon Nova only serve Bedrock-native APIs like Converse,
// which the gateway does not proxy, so listing them would offer uncallable models.
function isServedByGateway(model: GatewayModelCatalogEntry) {
  return getBedrockModelApiFormats(model.id).length > 0;
}
