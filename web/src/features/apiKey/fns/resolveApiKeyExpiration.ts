import {
  apiKeyExpirationOptions,
  type ApiKeyExpirationPreset,
} from "@/src/features/apiKey/constants/apiKeyExpirationOptions";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Resolves an expiration preset to an absolute date, null for no expiration, or undefined for an invalid custom date. */
export const resolveApiKeyExpiration = (
  preset: ApiKeyExpirationPreset,
  customDate: string,
  now: Date = new Date(),
): Date | null | undefined => {
  if (preset === "custom") return parseCustomExpiry(customDate, now);
  const days =
    apiKeyExpirationOptions.find((option) => option.value === preset)?.days ??
    null;
  if (days === null) return null;
  return new Date(now.getTime() + days * MS_PER_DAY);
};

const parseCustomExpiry = (customDate: string, now: Date): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customDate);
  if (!match) return undefined;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
  const isRealDate =
    endOfDay.getMonth() === month - 1 && endOfDay.getDate() === day;
  return isRealDate && endOfDay > now ? endOfDay : undefined;
};
