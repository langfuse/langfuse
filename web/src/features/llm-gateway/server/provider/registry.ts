import { z } from "zod/v4";

const gatewayApiFormats = [
  "openai.responses",
  "openai.chat-completions",
  "anthropic.messages",
] as const;

export const gatewayProviders = ["OPENAI", "ANTHROPIC", "OPENROUTER"] as const;

export type GatewayApiFormat = (typeof gatewayApiFormats)[number];
export type GatewayProviderName = (typeof gatewayProviders)[number];

export const GatewayApiFormatSchema = z.enum(gatewayApiFormats);
export const GatewayResolveResponseSchema = z
  .object({
    connection: z
      .object({
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
    // Key metadata is flattened alongside the trusted identifiers, so a
    // metadata key that collides with one of them is dropped on the way out.
    attribution: z.looseObject({
      organization_id: z.string(),
      project_id: z.string(),
      key_id: z.string(),
    }),
    ingestion: z
      .object({
        access_token: z.string(),
        token_type: z.literal("Bearer"),
        expires_in: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

const OpenAiGatewayModelsResponseSchema = z
  .object({
    object: z.literal("list"),
    data: z.array(
      z
        .object({
          id: z.string(),
          object: z.literal("model"),
          created: z.number().int().nonnegative(),
          owned_by: z.string(),
          shutdown_date: z.string().nullable().optional(),
        })
        .strict(),
    ),
  })
  .strict();

const AnthropicGatewayModelsResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          type: z.literal("model"),
          id: z.string(),
          display_name: z.string(),
          created_at: z.iso.datetime(),
          capabilities: z.record(z.string(), z.unknown()).nullable(),
          max_input_tokens: z.number().nullable(),
          max_tokens: z.number().nullable(),
        })
        .strict(),
    ),
    has_more: z.boolean(),
    first_id: z.string().nullable(),
    last_id: z.string().nullable(),
  })
  .strict();

export const GatewayModelsResponseSchema = z.union([
  OpenAiGatewayModelsResponseSchema,
  AnthropicGatewayModelsResponseSchema,
]);

const metadataValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const GatewayMetadataSchema = z.record(z.string(), metadataValueSchema);
export type GatewayMetadata = z.infer<typeof GatewayMetadataSchema>;

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
  OPENROUTER: {
    baseUrl: "https://openrouter.ai/api/v1",
    modelsPath: "/models",
    authType: "bearer",
    validationModel: "openai/gpt-4o-mini",
    apiFormats: [
      "openai.responses",
      "openai.chat-completions",
      "anthropic.messages",
    ],
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
