import { z } from "zod/v4";

import { getBedrockModelApiFormats } from "@/src/features/ai-gateway/fns/getBedrockModelApiFormats";
import {
  bedrockControlPlaneOrigin,
  decodeBedrockApiKey,
  GatewayBedrockConfigSchema,
} from "@/src/features/ai-gateway/server/provider/bedrock";
import { requestJson, standardHttpError } from "./shared";
import type {
  GatewayModelCatalogEntry,
  ModelDiscoveryAdapter,
  ModelDiscoveryError,
} from "../types";

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

const awsErrorBodySchema = z.object({
  __type: z.string().optional(),
  message: z.string().optional(),
  Message: z.string().optional(),
});

// The wording AWS uses when an authenticated IAM identity lacks an action.
const IAM_DENIAL_MESSAGE = /is not authorized to perform: (\S+)/i;

type ListAction =
  | "bedrock:ListFoundationModels"
  | "bedrock:ListInferenceProfiles";

type ListResult =
  | { success: true; models: GatewayModelCatalogEntry[] }
  | { success: false; error: ModelDiscoveryError | "listing_denied" };

// Lists on-demand foundation models plus system-defined inference profiles,
// because newer models (e.g. OpenAI GPT on Bedrock) are only invocable through
// a `us.`/`global.` profile ID. A key may call models without being allowed to
// list them, so a denied list contributes nothing instead of failing discovery.
export const bedrockModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, config, fetcher }) {
    const parsedConfig = GatewayBedrockConfigSchema.safeParse(config);
    if (!parsedConfig.success)
      return { success: false, error: "provider_error" };
    const request = {
      origin: bedrockControlPlaneOrigin(parsedConfig.data),
      headers: { authorization: `Bearer ${decodeBedrockApiKey(credential)}` },
      fetcher,
    };

    const models: GatewayModelCatalogEntry[] = [];
    let modelListingDenied = false;
    for (const list of [listFoundationModels, listInferenceProfiles]) {
      const result = await list(request);
      if (result.success) {
        models.push(...result.models);
      } else if (result.error === "listing_denied") {
        modelListingDenied = true;
      } else {
        return { success: false, error: result.error };
      }
    }
    return {
      success: true,
      models: models.filter(isServedByGateway),
      modelListingDenied,
    };
  },
};

type ListRequest = {
  origin: string;
  headers: Record<string, string>;
  fetcher: typeof fetch;
};

async function listFoundationModels(request: ListRequest): Promise<ListResult> {
  const url = new URL(`${request.origin}/foundation-models`);
  url.searchParams.set("byInferenceType", "ON_DEMAND");
  url.searchParams.set("byOutputModality", "TEXT");
  const response = await requestJson({ ...request, url });
  if (!response.success) return response;
  const error = bedrockHttpError(
    response.response,
    response.value,
    "bedrock:ListFoundationModels",
  );
  if (error) return { success: false, error };
  const parsed = foundationModelsSchema.safeParse(response.value);
  if (!parsed.success) return { success: false, error: "provider_error" };

  // LEGACY models are being retired and stop working at their end-of-life date.
  return {
    success: true,
    models: parsed.data.modelSummaries
      .filter((model) => model.modelLifecycle?.status !== "LEGACY")
      .map((model) => ({
        id: model.modelId,
        provider: "BEDROCK" as const,
        canonicalSlug: model.modelId,
        displayName: model.modelName ?? model.modelId,
        createdAt: UNKNOWN_CREATED_AT,
      })),
  };
}

async function listInferenceProfiles(
  request: ListRequest,
): Promise<ListResult> {
  const models: GatewayModelCatalogEntry[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const url = new URL(`${request.origin}/inference-profiles`);
    url.searchParams.set("type", "SYSTEM_DEFINED");
    url.searchParams.set("maxResults", "1000");
    if (nextToken) url.searchParams.set("nextToken", nextToken);

    const response = await requestJson({ ...request, url });
    if (!response.success) return response;
    const error = bedrockHttpError(
      response.response,
      response.value,
      "bedrock:ListInferenceProfiles",
    );
    if (error) return { success: false, error };
    const parsed = inferenceProfilesSchema.safeParse(response.value);
    if (!parsed.success) return { success: false, error: "provider_error" };

    models.push(
      ...parsed.data.inferenceProfileSummaries
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

    if (!parsed.data.nextToken) return { success: true, models };
    nextToken = parsed.data.nextToken;
  }
  return { success: false, error: "provider_error" };
}

// Models such as Amazon Nova only serve Bedrock-native APIs like Converse,
// which the gateway does not proxy, so listing them would offer uncallable models.
function isServedByGateway(model: GatewayModelCatalogEntry) {
  return getBedrockModelApiFormats(model.id).length > 0;
}

// AWS answers 403 both for a rejected key and for a valid key whose IAM identity
// lacks a list action. Only a denial of that exact list action proves the key may
// still call models; denying e.g. bedrock:CallWithBearerToken blocks inference too.
function bedrockHttpError(
  response: Response,
  body: unknown,
  action: ListAction,
) {
  if (response.status === 403 && isListActionDenial(response, body, action)) {
    return "listing_denied" as const;
  }
  return standardHttpError(response);
}

// The type arrives as `AccessDeniedException:<namespace>` in the header or as
// `<namespace>#AccessDeniedException` in the body.
function isListActionDenial(
  response: Response,
  body: unknown,
  action: ListAction,
) {
  const parsedBody = awsErrorBodySchema.safeParse(body);
  const fields = parsedBody.success ? parsedBody.data : {};
  const rawType =
    response.headers.get("x-amzn-errortype") ?? fields.__type ?? "";
  const errorType = rawType.split(":")[0].split("#").pop();
  const message = fields.message ?? fields.Message ?? "";
  const deniedAction = IAM_DENIAL_MESSAGE.exec(message)?.[1];
  return (
    errorType === "AccessDeniedException" &&
    deniedAction?.toLowerCase() === action.toLowerCase()
  );
}
