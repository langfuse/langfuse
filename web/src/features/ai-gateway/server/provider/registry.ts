import { z } from "zod/v4";

export const gatewayApiFormats = [
  "openai.responses",
  "openai.chat-completions",
  "anthropic.messages",
] as const;

export const gatewayProviders = ["OPENAI", "ANTHROPIC"] as const;

export type GatewayApiFormat = (typeof gatewayApiFormats)[number];
export type GatewayProviderName = (typeof gatewayProviders)[number];

export const GatewayApiFormatSchema = z.enum(gatewayApiFormats);
const metadataValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const GatewayMetadataSchema = z.record(z.string(), metadataValueSchema);
export type GatewayMetadata = z.infer<typeof GatewayMetadataSchema>;

const gatewayProviderIds = ["openai", "anthropic"] as const;
export type GatewayProviderId = (typeof gatewayProviderIds)[number];

export const GatewayResolveResponseSchema = z
  .object({
    version: z.literal(1),
    connection: z
      .object({
        id: z.string(),
        provider: z.enum(gatewayProviderIds),
        api_format: GatewayApiFormatSchema,
        base_url: z.url(),
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
        project_id: z.string(),
        key_id: z.string(),
        key_metadata: GatewayMetadataSchema,
      })
      .strict(),
    instrumentation_mode: z.enum(["usage", "full", "none"]),
    ingestion: z
      .object({
        access_token: z.string(),
        token_type: z.literal("Bearer"),
        expires_at: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

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

const PROVIDER_REGISTRY: Record<GatewayProviderName, ProviderDefinition> = {
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
  provider: GatewayProviderName,
): ProviderDefinition {
  return PROVIDER_REGISTRY[provider];
}

export function providerSupportsApiFormat(
  provider: GatewayProviderName,
  apiFormat: GatewayApiFormat,
): boolean {
  return PROVIDER_REGISTRY[provider].apiFormats.includes(apiFormat);
}
