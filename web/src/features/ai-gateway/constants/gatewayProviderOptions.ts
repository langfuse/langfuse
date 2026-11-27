import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

/** What a connection to each provider needs; the key order is the display order. */
const PROVIDER_CREDENTIAL_HINTS = {
  ANTHROPIC: "API key from console.anthropic.com",
  OPENAI: "API key from platform.openai.com",
  GOOGLE_AI_STUDIO: "API key from aistudio.google.com",
  XAI: "API key from console.x.ai",
  BEDROCK: "Bedrock API key and region",
  VERTEX: "Service account key and location",
  AZURE: "Resource name and API key",
  OPENROUTER: "API key from openrouter.ai",
  VERCEL: "API key from vercel.com",
} satisfies Record<GatewayProvider, string>;

export const GATEWAY_PROVIDER_OPTIONS = (
  Object.keys(PROVIDER_CREDENTIAL_HINTS) as GatewayProvider[]
).map((provider) => ({
  provider,
  hint: PROVIDER_CREDENTIAL_HINTS[provider],
}));
