import { z } from "zod/v4";
import {
  CUSTOM_PROVIDER_API_FORMATS_ERROR,
  CUSTOM_PROVIDER_MAX_API_FORMATS,
} from "@/src/features/ai-gateway/constants/customProviderApiFormats";
import {
  bedrockRuntimeOrigin,
  GatewayBedrockConfigSchema,
} from "@/src/features/ai-gateway/server/provider/bedrock";

export const gatewayApiFormats = [
  "openai.responses",
  "openai.chat-completions",
  "anthropic.messages",
] as const;

export const gatewayProviders = [
  "OPENAI",
  "ANTHROPIC",
  "BEDROCK",
  "CUSTOM",
] as const;

export type GatewayApiFormat = (typeof gatewayApiFormats)[number];
export type GatewayProviderName = (typeof gatewayProviders)[number];

export const GatewayApiFormatSchema = z.enum(gatewayApiFormats);
const metadataValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const GatewayMetadataSchema = z.record(z.string(), metadataValueSchema);
export type GatewayMetadata = z.infer<typeof GatewayMetadataSchema>;

/** The endpoints a custom connection serves, chosen by the user. */
export const GatewayCustomConfigSchema = z
  .object({
    apiFormats: z
      .array(GatewayApiFormatSchema)
      .min(1, CUSTOM_PROVIDER_API_FORMATS_ERROR)
      .max(CUSTOM_PROVIDER_MAX_API_FORMATS, CUSTOM_PROVIDER_API_FORMATS_ERROR)
      .refine((formats) => new Set(formats).size === formats.length, {
        message: CUSTOM_PROVIDER_API_FORMATS_ERROR,
      }),
  })
  .strict();

export const GatewayConnectionConfigSchema = z.union([
  GatewayBedrockConfigSchema,
  GatewayCustomConfigSchema,
]);
export type GatewayConnectionConfig = z.infer<
  typeof GatewayConnectionConfigSchema
>;

/** The stored config for the connection's provider, or null if it has none or it is invalid. */
export function parseGatewayConnectionConfig(
  provider: GatewayProviderName,
  config: unknown,
): GatewayConnectionConfig | null {
  if (provider === "BEDROCK") {
    return GatewayBedrockConfigSchema.safeParse(config).data ?? null;
  }
  if (provider === "CUSTOM") {
    return GatewayCustomConfigSchema.safeParse(config).data ?? null;
  }
  return null;
}

const gatewayProviderIds = [
  "openai",
  "anthropic",
  "bedrock",
  "custom",
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
  validationModel: string;
  apiFormats: readonly GatewayApiFormat[];
};

type OfficialGatewayProviderName = Exclude<
  GatewayProviderName,
  "BEDROCK" | "CUSTOM"
>;
type GatewayUpstream = Pick<ProviderDefinition, "baseUrl" | "authType">;

const PROVIDER_REGISTRY: Record<
  OfficialGatewayProviderName,
  ProviderDefinition
> = {
  OPENAI: {
    baseUrl: "https://api.openai.com/v1",
    modelsPath: "/models",
    authType: "bearer",
    validationModel: "gpt-4o-mini",
    apiFormats: ["openai.responses", "openai.chat-completions"],
  },
  ANTHROPIC: {
    baseUrl: "https://api.anthropic.com/v1",
    modelsPath: "/models",
    authType: "x-api-key",
    validationModel: "claude-haiku-4-5-20251001",
    apiFormats: ["anthropic.messages"],
  },
};

export function getGatewayProviderDefinition(
  provider: OfficialGatewayProviderName,
): ProviderDefinition {
  return PROVIDER_REGISTRY[provider];
}

/**
 * Providers whose connections may serve the API format. A custom connection
 * still needs `connectionSupportsApiFormat`, since its formats are per row.
 */
export function getCandidateProviders(
  apiFormat: GatewayApiFormat,
): GatewayProviderName[] {
  return gatewayProviders.filter(
    (provider) =>
      provider === "BEDROCK" ||
      provider === "CUSTOM" ||
      PROVIDER_REGISTRY[provider].apiFormats.includes(apiFormat),
  );
}

/**
 * Whether a connection can serve the API format. Bedrock serves every format;
 * a custom connection serves only the formats enabled in its config.
 */
export function connectionSupportsApiFormat(
  connection: { provider: GatewayProviderName; config: unknown },
  apiFormat: GatewayApiFormat,
): boolean {
  return getConnectionApiFormats(connection).includes(apiFormat);
}

export function getConnectionApiFormats(connection: {
  provider: GatewayProviderName;
  config: unknown;
}): readonly GatewayApiFormat[] {
  switch (connection.provider) {
    case "BEDROCK":
      return gatewayApiFormats;
    case "CUSTOM":
      return (
        GatewayCustomConfigSchema.safeParse(connection.config).data
          ?.apiFormats ?? []
      );
    default:
      return PROVIDER_REGISTRY[connection.provider].apiFormats;
  }
}

// Bedrock serves each API format natively under its own path and auth header.
// Throws if a Bedrock connection has no valid region config or a custom
// connection has no base URL. OpenAI and Anthropic always use the official
// origin. The credential scheme of a custom connection follows the API format.
export function getGatewayUpstream(params: {
  provider: GatewayProviderName;
  apiFormat: GatewayApiFormat;
  config: unknown;
  baseURL: string | null;
}): GatewayUpstream {
  if (params.provider === "CUSTOM") {
    if (!params.baseURL) {
      throw new Error("Custom gateway connection has no base URL");
    }
    return {
      baseUrl: params.baseURL,
      authType:
        params.apiFormat === "anthropic.messages" ? "x-api-key" : "bearer",
    };
  }
  if (params.provider !== "BEDROCK") {
    const { baseUrl, authType } = PROVIDER_REGISTRY[params.provider];
    return { baseUrl, authType };
  }

  const origin = bedrockRuntimeOrigin(
    GatewayBedrockConfigSchema.parse(params.config),
  );
  if (params.apiFormat === "anthropic.messages") {
    return { baseUrl: `${origin}/anthropic/v1`, authType: "x-api-key" };
  }
  return { baseUrl: `${origin}/openai/v1`, authType: "bearer" };
}
