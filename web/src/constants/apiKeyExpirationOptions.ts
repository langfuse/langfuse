import type { ApiKeyExpirationPreset } from "@/src/types/apiKeyExpiration";

export const apiKeyExpirationOptions: {
  value: ApiKeyExpirationPreset;
  label: string;
  days: number | null;
}[] = [
  { value: "never", label: "No expiration", days: null },
  { value: "30d", label: "30 days", days: 30 },
  { value: "60d", label: "60 days", days: 60 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "1y", label: "1 year", days: 365 },
  { value: "custom", label: "Custom date…", days: null },
];
