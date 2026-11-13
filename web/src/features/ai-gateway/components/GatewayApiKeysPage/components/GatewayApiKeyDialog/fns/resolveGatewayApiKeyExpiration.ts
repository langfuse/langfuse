import { resolveExpirationFromOptions } from "@/src/features/apiKey/fns/resolveApiKeyExpiration";
import {
  gatewayApiKeyExpirationOptions,
  type GatewayApiKeyExpirationPreset,
} from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";

/** Resolves a gateway expiration preset to an absolute date, null for no expiration, or undefined for an invalid custom date. */
export const resolveGatewayApiKeyExpiration = (
  preset: GatewayApiKeyExpirationPreset,
  customDate: string,
  now: Date = new Date(),
): Date | null | undefined =>
  resolveExpirationFromOptions(
    gatewayApiKeyExpirationOptions,
    preset,
    customDate,
    now,
  );
