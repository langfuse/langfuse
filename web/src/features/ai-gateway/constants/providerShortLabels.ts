import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

/** Provider names short enough for a pill in the gateway diagrams. */
export const providerShortLabels = {
  ...providerLabels,
  BEDROCK: "Bedrock",
  VERCEL: "Vercel",
  AZURE: "Azure",
  GOOGLE_AI_STUDIO: "Google AI",
  VERTEX: "Vertex AI",
} satisfies Record<GatewayProvider, string>;
