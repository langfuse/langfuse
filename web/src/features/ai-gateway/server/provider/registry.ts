import { z } from "zod/v4";
import {
  bedrockRuntimeOrigin,
  decodeBedrockApiKey,
  GatewayBedrockConfigSchema,
} from "@/src/features/ai-gateway/server/provider/bedrock";
import {
  GatewayVertexConfigSchema,
  getVertexAccessToken,
  vertexOpenAICompatibleBaseUrl,
} from "@/src/features/ai-gateway/server/provider/vertex";

export const gatewayApiFormats = [
  "openai.responses",
  "openai.chat-completions",
  "openai.decisions",
  "openai.embeddings",
  "anthropic.messages",
] as const;

export const gatewayProviders = [
  "OPENAI",
  "ANTHROPIC",
  "BEDROCK",
  "OPENROUTER",
  "XAI",
  "VERCEL",
  "AZURE",
  "GOOGLE_AI_STUDIO",
  "VERTEX",
] as const;

export type GatewayApiFormat = (typeof gatewayApiFormats)[number];
export type GatewayProviderName = (typeof gatewayProviders)[number];

export const GatewayApiFormatSchema = z.enum(gatewayApiFormats);
const metadataValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const GatewayMetadataSchema = z.record(z.string(), metadataValueSchema);
export type GatewayMetadata = z.infer<typeof GatewayMetadataSchema>;

// Bedrock keeps its region and Vertex AI its location; other providers have no config.
export const GatewayProviderConfigSchema = z.union([
  GatewayBedrockConfigSchema,
  GatewayVertexConfigSchema,
]);
export type GatewayProviderConfig = z.infer<typeof GatewayProviderConfigSchema>;

const gatewayProviderIds = [
  "openai",
  "anthropic",
  "bedrock",
  "openrouter",
  "xai",
  "vercel",
  "azure",
  "google_ai_studio",
  "vertex",
] as const;
export type GatewayProviderId = (typeof gatewayProviderIds)[number];

export const GatewayResolveResponseSchema = z
  .object({
    version: z.literal(1),
    connection: z
      .object({
        id: z.string(),
        name: z.string(),
        provider: z.enum(gatewayProviderIds),
        provider_model: z.string(),
        api_format: GatewayApiFormatSchema,
        base_url: z.url(),
        extra_headers: z.record(z.string(), z.string()),
        auth: z.union([
          z.object({ type: z.literal("Bearer"), token: z.string() }).strict(),
          z
            .object({
              type: z.literal("x-api-key"),
              header: z.literal("x-api-key"),
              value: z.string(),
            })
            .strict(),
        ]),
      })
      .strict(),
    attribution: z
      .object({
        organization_id: z.string(),
        // Null only in "none" mode, which needs no ingestion project.
        project_id: z.string().nullable(),
        key_id: z.string(),
        // The bound user is the key's owner. Null for keys created before
        // keys were bound to users.
        user_id: z.string().nullable(),
        key_name: z.string().nullable(),
        user_name: z.string().nullable(),
        user_email: z.string().nullable(),
        key_metadata: GatewayMetadataSchema,
        provider_connection_id: z.string(),
      })
      .strict(),
    ingestion_mode: z.enum(["none", "usage", "full"]),
    // Null exactly in "none" mode: nothing is delivered, so no grant is minted.
    ingestion: z
      .object({
        access_token: z.string(),
        token_type: z.literal("Bearer"),
        expires_at: z.number().int().positive(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type GatewayResolveResponse = z.infer<
  typeof GatewayResolveResponseSchema
>;

export const GatewayModelsResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.string(),
          provider: z.enum(gatewayProviders),
          canonicalSlug: z.string(),
          displayName: z.string(),
          createdAt: z.iso.datetime(),
        })
        .strict(),
    ),
  })
  .strict();

type ProviderDefinition = {
  baseUrl: string;
  modelsPath: string;
  authType: "bearer" | "x-api-key";
  // How a new key is checked: a one-token call to a model, or a GET that
  // fails only for a bad key when a model call could fail for a valid one.
  // `usable` rejects keys the GET reports as unusable despite a 2xx.
  credentialCheck:
    | { model: string }
    | { path: string; usable?: (body: unknown) => boolean };
  apiFormats: readonly GatewayApiFormat[];
};

type HostedGatewayProviderName = Exclude<
  GatewayProviderName,
  "BEDROCK" | "AZURE" | "VERTEX"
>;
type GatewayUpstream = Pick<ProviderDefinition, "baseUrl" | "authType">;

const PROVIDER_REGISTRY: Record<HostedGatewayProviderName, ProviderDefinition> =
  {
    OPENAI: {
      baseUrl: "https://api.openai.com/v1",
      modelsPath: "/models",
      authType: "bearer",
      credentialCheck: { model: "gpt-4o-mini" },
      apiFormats: [
        "openai.responses",
        "openai.chat-completions",
        "openai.decisions",
        "openai.embeddings",
      ],
    },
    ANTHROPIC: {
      baseUrl: "https://api.anthropic.com/v1",
      modelsPath: "/models",
      authType: "x-api-key",
      credentialCheck: { model: "claude-haiku-4-5-20251001" },
      apiFormats: ["anthropic.messages"],
    },
    // OpenRouter takes a Bearer key on every format, including Anthropic Messages.
    // Its Decisions endpoint is an alpha with its own request shape, so it is not routed.
    OPENROUTER: {
      baseUrl: "https://openrouter.ai/api/v1",
      modelsPath: "/models/user",
      authType: "bearer",
      // A test completion fails for valid keys whose credits, data policy or
      // provider preferences exclude the test model.
      credentialCheck: { path: "/key" },
      apiFormats: [
        "openai.responses",
        "openai.chat-completions",
        "openai.embeddings",
        "anthropic.messages",
      ],
    },
    // xAI's Anthropic Messages compatibility is deprecated, so only the OpenAI
    // formats are routed.
    XAI: {
      baseUrl: "https://api.x.ai/v1",
      modelsPath: "/language-models",
      authType: "bearer",
      // A test completion fails for valid keys without credits or whose model
      // ACLs exclude the test model.
      credentialCheck: { path: "/api-key", usable: isUsableXaiKey },
      apiFormats: ["openai.responses", "openai.chat-completions"],
    },
    // Vercel takes a Bearer key on every format, including Anthropic Messages.
    VERCEL: {
      baseUrl: "https://ai-gateway.vercel.sh/v1",
      // Annotates each model with its eligibility under the team's allowlists
      // and routing rules.
      modelsPath: "/models?include_availability",
      authType: "bearer",
      // A test completion fails for valid keys without credits or whose team
      // allowlists exclude the test model.
      credentialCheck: { path: "/credits" },
      apiFormats: gatewayApiFormats,
    },
    // Gemini API's OpenAI-compatible endpoint, which has no Responses route:
    // https://ai.google.dev/gemini-api/docs/openai
    GOOGLE_AI_STUDIO: {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      modelsPath: "/models",
      authType: "bearer",
      // A test completion fails for valid keys whose project lacks access to
      // or quota for the test model.
      credentialCheck: { path: "/models" },
      apiFormats: ["openai.chat-completions", "openai.embeddings"],
    },
  };

export function getGatewayProviderDefinition(
  provider: HostedGatewayProviderName,
): ProviderDefinition {
  return PROVIDER_REGISTRY[provider];
}

export function providerSupportsApiFormat(
  provider: GatewayProviderName,
  apiFormat: GatewayApiFormat,
): boolean {
  if (provider === "BEDROCK") {
    return (
      apiFormat !== "openai.decisions" && apiFormat !== "openai.embeddings"
    );
  }
  if (provider === "AZURE") return apiFormat !== "openai.decisions";
  if (provider === "VERTEX") return apiFormat === "openai.chat-completions";
  return PROVIDER_REGISTRY[provider].apiFormats.includes(apiFormat);
}

// Bedrock and Azure serve each supported API format natively under its own path
// and auth header, Bedrock on its regional runtime and Azure on the origin of
// the resource stored as the connection's base URL. Vertex AI serves Chat
// Completions on an OpenAI-compatible endpoint of the key's project in the
// connection's location.
// Throws if a Bedrock or Vertex AI connection has no valid config or an Azure
// connection has no endpoint. OpenAI, Anthropic and OpenRouter connections may
// override the official base URL; xAI, Vercel and Google AI Studio never store
// one.
export function getGatewayUpstream(params: {
  provider: GatewayProviderName;
  apiFormat: GatewayApiFormat;
  config: unknown;
  baseURL: string | null;
  /** The stored credential, decrypted. */
  credential: string;
}): GatewayUpstream {
  if (params.provider === "AZURE") {
    if (!params.baseURL) throw new Error("Azure connection has no endpoint.");
    return getPerFormatUpstream(
      new URL(params.baseURL).origin,
      params.apiFormat,
    );
  }
  if (params.provider === "VERTEX") {
    return {
      baseUrl: vertexOpenAICompatibleBaseUrl({
        config: GatewayVertexConfigSchema.parse(params.config),
        credential: params.credential,
      }),
      authType: "bearer",
    };
  }
  if (params.provider !== "BEDROCK") {
    const { baseUrl, authType } = PROVIDER_REGISTRY[params.provider];
    return { baseUrl: params.baseURL ?? baseUrl, authType };
  }

  const origin = bedrockRuntimeOrigin(
    GatewayBedrockConfigSchema.parse(params.config),
  );
  return getPerFormatUpstream(origin, params.apiFormat);
}

function getPerFormatUpstream(
  origin: string,
  apiFormat: GatewayApiFormat,
): GatewayUpstream {
  if (apiFormat === "anthropic.messages") {
    return { baseUrl: `${origin}/anthropic/v1`, authType: "x-api-key" };
  }
  return { baseUrl: `${origin}/openai/v1`, authType: "bearer" };
}

/** The secret sent upstream for a decrypted stored credential. Vertex AI keys are exchanged for an access token. */
export async function getGatewayUpstreamSecret(params: {
  provider: GatewayProviderName;
  credential: string;
}): Promise<string> {
  if (params.provider === "BEDROCK") {
    return decodeBedrockApiKey(params.credential);
  }
  if (params.provider === "VERTEX") {
    return getVertexAccessToken(params.credential);
  }
  return params.credential;
}

const xaiApiKeySchema = z.object({
  api_key_blocked: z.boolean(),
  api_key_disabled: z.boolean(),
  team_blocked: z.boolean(),
});

// xAI answers 200 for disabled or blocked keys and reports their state in the body.
function isUsableXaiKey(body: unknown): boolean {
  const key = xaiApiKeySchema.safeParse(body);
  return (
    key.success &&
    !key.data.api_key_blocked &&
    !key.data.api_key_disabled &&
    !key.data.team_blocked
  );
}
