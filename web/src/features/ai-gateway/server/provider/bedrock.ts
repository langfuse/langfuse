import { BedrockApiKeySchema } from "@langfuse/shared";
import { z } from "zod/v4";

// Kept in sync with the gateway's base URL check: the region becomes a DNS
// label of a fixed AWS host, so it must not be able to change the host.
const AWS_REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-[0-9]+$/;

export const GatewayBedrockConfigSchema = z
  .object({ region: z.string().regex(AWS_REGION_PATTERN) })
  .strict();
export type GatewayBedrockConfig = z.infer<typeof GatewayBedrockConfigSchema>;

// Same shape as LLM connections so SigV4 access keys can share the column later.
export function encodeBedrockCredential(apiKey: string) {
  return JSON.stringify(BedrockApiKeySchema.parse({ apiKey }));
}

export function decodeBedrockApiKey(credential: string) {
  return BedrockApiKeySchema.parse(JSON.parse(credential)).apiKey;
}

export function bedrockRuntimeOrigin(config: GatewayBedrockConfig) {
  return `https://bedrock-runtime.${config.region}.amazonaws.com`;
}

export function bedrockControlPlaneOrigin(config: GatewayBedrockConfig) {
  return `https://bedrock.${config.region}.amazonaws.com`;
}
