import { z } from "zod/v4";

const gatewayApiFormats = [
  "openai.responses",
  "openai.chat-completions",
  "anthropic.messages",
] as const;

export const gatewayProviders = ["OPENAI", "ANTHROPIC", "OPENROUTER"] as const;

export type GatewayApiFormat = (typeof gatewayApiFormats)[number];
export type GatewayProviderName = (typeof gatewayProviders)[number];
export type GatewayMetadata = Record<string, string | number | boolean>;

export const GatewayApiFormatSchema = z.enum(gatewayApiFormats);

const metadataValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export const GatewayMetadataSchema = z.record(z.string(), metadataValueSchema);

type ProviderDefinition = {
  baseUrl: string;
  modelsPath: string;
  authType: "bearer" | "x-api-key";
  apiFormats: readonly GatewayApiFormat[];
};

const PROVIDER_REGISTRY: Record<GatewayProviderName, ProviderDefinition> = {
  OPENAI: {
    baseUrl: "https://api.openai.com/v1",
    modelsPath: "/models",
    authType: "bearer",
    apiFormats: ["openai.responses", "openai.chat-completions"],
  },
  ANTHROPIC: {
    baseUrl: "https://api.anthropic.com/v1",
    modelsPath: "/models",
    authType: "x-api-key",
    apiFormats: ["anthropic.messages"],
  },
  OPENROUTER: {
    baseUrl: "https://openrouter.ai/api/v1",
    modelsPath: "/models",
    authType: "bearer",
    apiFormats: ["openai.responses", "openai.chat-completions"],
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

export function assertFlatGatewayMetadata(value: unknown): GatewayMetadata {
  const result = GatewayMetadataSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Gateway key metadata must contain flat scalar values");
  }
  return result.data;
}
