import { resolveApiKeyExpiration } from "@/src/features/apiKey/fns/resolveApiKeyExpiration";
import {
  gatewayApiKeyExpirationOptions,
  type GatewayApiKeyExpirationPreset,
} from "@/src/features/ai-gateway/constants/gatewayApiKeyExpirationOptions";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Resolves a gateway expiration preset to an absolute date, null for no expiration, or undefined for an invalid custom date. */
export const resolveGatewayApiKeyExpiration = (
  preset: GatewayApiKeyExpirationPreset,
  customDate: string,
  now: Date = new Date(),
): Date | null | undefined => {
  if (preset === "custom") {
    return resolveApiKeyExpiration("custom", customDate, now);
  }
  const days =
    gatewayApiKeyExpirationOptions.find((option) => option.value === preset)
      ?.days ?? null;
  if (days === null) return null;
  return new Date(now.getTime() + days * MS_PER_DAY);
};
