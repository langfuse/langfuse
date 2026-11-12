export const gatewayApiKeyExpirationOptions = [
  { value: "never", label: "Never", days: null, summary: "No expiration" },
  { value: "1d", label: "1 day", days: 1, summary: "Expires in 1 day" },
  { value: "1w", label: "1 week", days: 7, summary: "Expires in 1 week" },
  { value: "1y", label: "1 year", days: 365, summary: "Expires in 1 year" },
  {
    value: "custom",
    label: "Custom",
    days: null,
    summary: "Custom expiration",
  },
] as const;

export type GatewayApiKeyExpirationPreset =
  (typeof gatewayApiKeyExpirationOptions)[number]["value"];
